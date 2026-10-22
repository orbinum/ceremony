/**
 * The session cookie and the OAuth state cookie. `__Host-` means Secure, Path=/ and no Domain,
 * so neither can be set or read by a subdomain. The session is scoped to its ceremony, so a
 * cookie of one deployment is worthless on another. SPEC §3.2.
 */
import {
  SESSION_RULES,
  signToken,
  validateSessionClaims,
  verifyToken,
} from "@orbinum-ceremony/core";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

/** The session cookie's name. */
const SESSION_COOKIE = "__Host-ceremony-session";
/** The OAuth attempt cookie's name. */
const STATE_COOKIE = "__Host-oauth-state";
const OPTIONS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

const sessionScope = (env: Env) => `session:${env.CEREMONY_ID}`;
const stateScope = (env: Env) => `oauth-state:${env.CEREMONY_ID}`;

/** Signs the caller in for `SESSION_RULES.ttlMs`. */
export function startSession(c: Context<AppEnv>, gid: number, login: string): void {
  const token = signToken(
    sessionScope(c.env),
    { gid, login },
    c.env.SESSION_KEY,
    SESSION_RULES.ttlMs,
    Date.now(),
  );
  setCookie(c, SESSION_COOKIE, token, { ...OPTIONS, maxAge: SESSION_RULES.ttlMs / 1000 });
}

/** The identity of a valid session cookie of this ceremony, and when it expires; null if none. */
export function sessionOf(c: Context<AppEnv>) {
  const payload = verifyToken(
    sessionScope(c.env),
    getCookie(c, SESSION_COOKIE),
    c.env.SESSION_KEY,
    Date.now(),
  );
  if (!payload) return null;
  try {
    return { ...validateSessionClaims(payload), exp: payload.exp as number };
  } catch {
    return null;
  }
}

/** Signs the caller out (this browser; the token itself lives until it expires, KL-37). */
export const endSession = (c: Context) => deleteCookie(c, SESSION_COOKIE, OPTIONS);

/** Binds an OAuth attempt to this browser: its state and PKCE verifier, for 10 minutes. */
export function rememberOAuth(c: Context<AppEnv>, state: string, verifier: string) {
  const token = signToken(
    stateScope(c.env),
    { state, verifier },
    c.env.SESSION_KEY,
    SESSION_RULES.oauthStateTtlMs,
    Date.now(),
  );
  setCookie(c, STATE_COOKIE, token, { ...OPTIONS, maxAge: SESSION_RULES.oauthStateTtlMs / 1000 });
}

/** The OAuth attempt this browser started, read once (the cookie is cleared). */
export function recallOAuth(c: Context<AppEnv>): { state: string; verifier: string } | null {
  const payload = verifyToken(
    stateScope(c.env),
    getCookie(c, STATE_COOKIE),
    c.env.SESSION_KEY,
    Date.now(),
  );
  deleteCookie(c, STATE_COOKIE, OPTIONS);
  const { state, verifier } = payload ?? {};
  return typeof state === "string" && typeof verifier === "string" ? { state, verifier } : null;
}
