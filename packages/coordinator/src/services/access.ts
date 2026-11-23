/**
 * Cloudflare Access in front of `/admin/*`, checked again in the Worker: the
 * `Cf-Access-Jwt-Assertion` JWT must be RS256-signed by the team's keys, for this application's
 * audience, from this team, and unexpired. A request that bypassed the edge has no such token and
 * is refused. COORDINATOR §3.
 */
import { fromBase64url, fromUtf8 } from "@orbinum-ceremony/core";

/** The header Cloudflare Access sets on requests it let through. */
export const ACCESS_HEADER = "cf-access-jwt-assertion";

interface Jwk extends JsonWebKey {
  kid: string;
}

const KEYS_TTL_MS = 10 * 60_000;
/** A rotation shows up as an unknown `kid`: refetch, but at most this often. */
const REFETCH_MIN_MS = 30_000;
const TIMEOUT_MS = 10_000;

let cache: { team: string; keys: Jwk[]; at: number } | null = null;
let failedAt: { team: string; at: number } | null = null;
/**
 * The fetch in flight: concurrent requests share it instead of each starting their own. Shared
 * only within its time limit: if the request that started it is cancelled, its I/O may never
 * settle, and later requests must not wait on it.
 */
let inflight: { team: string; at: number; keys: Promise<Jwk[]> } | null = null;

function fetchKeys(team: string, now: number): Promise<Jwk[]> {
  if (inflight?.team === team && now - inflight.at < TIMEOUT_MS) return inflight.keys;
  const keys = loadKeys(team, now).finally(() => {
    if (inflight?.keys === keys) inflight = null;
  });
  inflight = { team, at: now, keys };
  return keys;
}

async function loadKeys(team: string, now: number): Promise<Jwk[]> {
  if (failedAt?.team === team && now - failedAt.at < REFETCH_MIN_MS) {
    throw new Error("access certs: recently unavailable");
  }
  try {
    const response = await fetch(`${team}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`access certs: ${response.status}`);
    const { keys } = (await response.json()) as { keys: Jwk[] };
    cache = { team, keys, at: now };
    return keys;
  } catch (error) {
    failedAt = { team, at: now };
    throw error;
  }
}

/** The key for `kid`: cached keys first, refetched when it is unknown (rotation) or stale. */
async function keyFor(team: string, kid: unknown, now: number): Promise<Jwk | undefined> {
  const fresh = cache?.team === team && now - cache.at < KEYS_TTL_MS;
  const cached = fresh ? cache?.keys.find((k) => k.kid === kid) : undefined;
  if (cached) return cached;
  if (fresh && cache && now - cache.at < REFETCH_MIN_MS) return undefined;
  return (await fetchKeys(team, now)).find((k) => k.kid === kid);
}

/** A service token's Client ID, as Access puts it in `common_name`. */
const SERVICE_TOKEN = /^[0-9a-f]{32}\.access$/;

const json = (part: string) => JSON.parse(fromUtf8(fromBase64url(part))) as Record<string, unknown>;

/** The verified identity of an Access token (person or service token); null for anything else. */
export async function verifyAccess(
  token: string | undefined,
  team: string,
  audience: string,
  now = Date.now(),
): Promise<string | null> {
  const [h, p, sig, extra] = token?.split(".") ?? [];
  if (!h || !p || !sig || extra !== undefined) return null;
  try {
    const header = json(h);
    if (header.alg !== "RS256") return null;
    const jwk = await keyFor(team, header.kid, now);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signed = new TextEncoder().encode(`${h}.${p}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64url(sig), signed))) {
      return null;
    }
    const claims = json(p);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const seconds = now / 1000;
    if (!aud.includes(audience) || claims.iss !== team) return null;
    if (typeof claims.exp !== "number" || claims.exp <= seconds) return null;
    if (typeof claims.nbf === "number" && claims.nbf > seconds) return null;
    // A person has `email`; a service token (`cli publish-init`) has `common_name`, its Client ID.
    // Anything else in `common_name` (a certificate's subject) is never an operator, so no other
    // identity type can spell an allowlisted email.
    if (claims.email !== undefined && claims.email !== null) {
      // An email has an @: never the spelling of a service token's Client ID.
      return typeof claims.email === "string" && claims.email.includes("@") ? claims.email : null;
    }
    const cn = claims.common_name;
    return typeof cn === "string" && SERVICE_TOKEN.test(cn) ? cn : null;
  } catch {
    return null;
  }
}
