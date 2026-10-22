/**
 * Signed, expiring tokens (a session cookie, an OAuth state):
 * `base64url(JSON payload).hex(HMAC-SHA-256(key, scope + "." + payload))`. The scope keeps a token
 * of one kind (or of one ceremony) from being accepted as another under the same key.
 */
import { fromBase64url, fromUtf8, toBase64url, utf8 } from "../encoding";
import { hmacSha256Hex, keyBytes, timingSafeEqual } from "./mac";

const TOKEN_KEY = "token key";

/** A token for `payload` under `scope`, valid for `ttlMs` from `now`. */
export function signToken(
  scope: string,
  payload: Record<string, unknown>,
  key: string,
  ttlMs: number,
  now: number,
): string {
  const body = toBase64url(utf8(JSON.stringify({ ...payload, exp: now + ttlMs })));
  return `${body}.${hmacSha256Hex(keyBytes(key, TOKEN_KEY), `${scope}.${body}`)}`;
}

/**
 * The payload of a token of this scope, signed with this key and unexpired at `now`; null for
 * anything else. The payload is unvalidated JSON: the caller checks its fields.
 */
export function verifyToken(
  scope: string,
  token: string | undefined,
  key: string,
  now: number,
): Record<string, unknown> | null {
  const k = keyBytes(key, TOKEN_KEY);
  const [body, mac, extra] = token?.split(".") ?? [];
  if (!body || !mac || extra !== undefined) return null;
  if (!timingSafeEqual(mac, hmacSha256Hex(k, `${scope}.${body}`))) return null;
  try {
    const payload = JSON.parse(fromUtf8(fromBase64url(body))) as unknown;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === "number" && exp > now ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
