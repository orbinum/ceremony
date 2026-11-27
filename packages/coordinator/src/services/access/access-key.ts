/**
 * The Cloudflare Access team's signing key for a `kid`: cached keys first (ten minutes), refetched
 * when the `kid` is unknown (a rotation) or the cache is stale, but at most every 30 s, also after a
 * failed fetch. Concurrent requests share the fetch in flight, only within its time limit: if the
 * request that started it is cancelled, its I/O may never settle, and later requests must not wait
 * on it.
 */
export interface Jwk extends JsonWebKey {
  kid: string;
}

const KEYS_TTL_MS = 10 * 60_000;
const REFETCH_MIN_MS = 30_000;
const TIMEOUT_MS = 10_000;

let cache: { team: string; keys: Jwk[]; at: number } | null = null;
let failedAt: { team: string; at: number } | null = null;
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

export async function accessKey(team: string, kid: unknown, now: number): Promise<Jwk | undefined> {
  const fresh = cache?.team === team && now - cache.at < KEYS_TTL_MS;
  const cached = fresh ? cache?.keys.find((k) => k.kid === kid) : undefined;
  if (cached) return cached;
  if (fresh && cache && now - cache.at < REFETCH_MIN_MS) return undefined;
  return (await fetchKeys(team, now)).find((k) => k.kid === kid);
}
