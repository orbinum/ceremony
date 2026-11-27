/**
 * A signed, expiring token (a session cookie, an OAuth state) for `payload` under `scope`, valid
 * for `ttlMs` from `now`: `base64url(JSON payload).hex(HMAC-SHA-256(key, scope + "." + payload))`.
 * The scope keeps a token of one kind (or of one ceremony) from being accepted as another under
 * the same key.
 */
import { toBase64url, utf8 } from "../../encoding";
import { TOKEN_KEY } from "./constants";
import { hmacSha256Hex, keyBytes } from "../mac";

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
