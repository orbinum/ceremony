/** Signs the caller in with a session cookie for `SESSION_RULES.ttlMs`, scoped to this ceremony. */
import { SESSION_RULES, signToken } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { COOKIE_OPTIONS, SESSION_COOKIE } from "./constants";
import { sessionScope } from "./scopes";

export function startSession(c: Context<AppEnv>, gid: number, login: string): void {
  const token = signToken(
    sessionScope(c.env),
    { gid, login },
    c.env.SESSION_KEY,
    SESSION_RULES.ttlMs,
    Date.now(),
  );
  setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_RULES.ttlMs / 1000 });
}
