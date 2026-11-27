/**
 * The identity a CLI token vouches for, and when it expires, from an `Authorization` header; null
 * for a header that is not exactly `Bearer` and one valid, unexpired token of this ceremony in the
 * token's own alphabet (base64url body, hex MAC).
 */
import { validateSessionClaims, verifyToken } from "@orbinum-ceremony/core";
import { cliScope } from "./scopes";

const BEARER = /^Bearer ([A-Za-z0-9_-]{1,1024}\.[0-9a-f]{64})$/;

export function cliIdentityOf(env: Env, authorization: string, now: number) {
  const token = BEARER.exec(authorization)?.[1];
  const payload = token ? verifyToken(cliScope(env), token, env.SESSION_KEY, now) : null;
  if (!payload) return null;
  try {
    return { ...validateSessionClaims(payload), exp: payload.exp as number };
  } catch {
    return null;
  }
}
