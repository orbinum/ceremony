/**
 * A contributor's CLI token (SPEC §4.4): minted in the browser for a signed-in identity, sent by
 * the CLI as `Authorization: Bearer`. Its own scope, so neither a session cookie nor a token of
 * another ceremony passes for one; short-lived, and never past the session it came from.
 */
import {
  SESSION_RULES,
  signToken,
  validateSessionClaims,
  verifyToken,
} from "@orbinum-ceremony/core";

const cliScope = (env: Env) => `cli:${env.CEREMONY_ID}`;

/** `Bearer <token>`: the token's own alphabet (base64url body, hex MAC), nothing else. */
const BEARER = /^Bearer ([A-Za-z0-9_-]{1,1024}\.[0-9a-f]{64})$/;

/** A CLI token for this identity, from `now` for the CLI lifetime but never past `until`. */
export function signCliToken(
  env: Env,
  identity: { gid: number; login: string },
  until: number,
  now: number,
): { token: string; expiresAt: number } {
  const ttl = Math.min(SESSION_RULES.cliTokenTtlMs, until - now);
  const token = signToken(cliScope(env), identity, env.SESSION_KEY, ttl, now);
  return { token, expiresAt: now + ttl };
}

/**
 * The identity a CLI token vouches for, and when it expires, from an `Authorization` header;
 * null for a header that is not exactly one valid, unexpired token of this ceremony.
 */
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
