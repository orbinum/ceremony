/** The identity of a valid session cookie of this ceremony, and when it expires; null if none. */
import { validateSessionClaims, verifyToken } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { SESSION_COOKIE } from "./constants";
import { sessionScope } from "./scopes";

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
