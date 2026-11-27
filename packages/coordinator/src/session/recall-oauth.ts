/** The OAuth attempt this browser started, read once: the cookie is cleared as it is read. */
import { verifyToken } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { COOKIE_OPTIONS, STATE_COOKIE } from "./constants";
import { stateScope } from "./scopes";

export function recallOAuth(c: Context<AppEnv>): { state: string; verifier: string } | null {
  const payload = verifyToken(
    stateScope(c.env),
    getCookie(c, STATE_COOKIE),
    c.env.SESSION_KEY,
    Date.now(),
  );
  deleteCookie(c, STATE_COOKIE, COOKIE_OPTIONS);
  const { state, verifier } = payload ?? {};
  return typeof state === "string" && typeof verifier === "string" ? { state, verifier } : null;
}
