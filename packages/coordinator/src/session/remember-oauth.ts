/** Binds an OAuth attempt to this browser: its state and PKCE verifier, signed, for 10 minutes. */
import { SESSION_RULES, signToken } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { COOKIE_OPTIONS, STATE_COOKIE } from "./constants";
import { stateScope } from "./scopes";

export function rememberOAuth(c: Context<AppEnv>, state: string, verifier: string) {
  const token = signToken(
    stateScope(c.env),
    { state, verifier },
    c.env.SESSION_KEY,
    SESSION_RULES.oauthStateTtlMs,
    Date.now(),
  );
  setCookie(c, STATE_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_RULES.oauthStateTtlMs / 1000,
  });
}
