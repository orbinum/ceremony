/**
 * The payload of a `signToken` token of this scope, signed with this key and unexpired at `now`;
 * null for anything else. The payload is unvalidated JSON: the caller checks its fields.
 */
import { fromBase64url, fromUtf8 } from "../../encoding";
import { TOKEN_KEY } from "./constants";
import { hmacSha256Hex, keyBytes, timingSafeEqual } from "../mac";

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
