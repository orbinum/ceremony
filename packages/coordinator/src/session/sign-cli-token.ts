/**
 * A contributor's CLI token, minted from the browser for a signed-in identity and sent by the CLI
 * as `Authorization: Bearer`: valid for the CLI lifetime from `now` but never past `until`, the
 * end of the session it came from.
 */
import { SESSION_RULES, signToken } from "@orbinum-ceremony/core";
import { cliScope } from "./scopes";

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
