/**
 * Cloudflare Access in front of `/admin/*`, checked again in the Worker: the
 * `Cf-Access-Jwt-Assertion` JWT must be RS256-signed by the team's keys, for this application's
 * audience, from this team, and unexpired; a request that bypassed the edge has no such token and
 * is refused. The identity is a person's `email` (it must have an @, never the spelling of a
 * service token) or a service token's Client ID in `common_name`; anything else there (a
 * certificate's subject) is never an operator, so no other identity type can spell an allowlisted
 * name. Null for anything that does not verify.
 */
import { fromBase64url, fromUtf8 } from "@orbinum-ceremony/core";
import { accessKey } from "./access-key";

const SERVICE_TOKEN = /^[0-9a-f]{32}\.access$/;

const json = (part: string) => JSON.parse(fromUtf8(fromBase64url(part))) as Record<string, unknown>;

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
    const jwk = await accessKey(team, header.kid, now);
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
    if (claims.email !== undefined && claims.email !== null) {
      return typeof claims.email === "string" && claims.email.includes("@") ? claims.email : null;
    }
    const cn = claims.common_name;
    return typeof cn === "string" && SERVICE_TOKEN.test(cn) ? cn : null;
  } catch {
    return null;
  }
}
