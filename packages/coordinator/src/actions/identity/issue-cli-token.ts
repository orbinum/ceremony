/**
 * A contributor's CLI token, asked for from the browser: only for an identity whose wallet is
 * linked (the browser steps are done), not to a banned or held one, and never once the ceremony is
 * sealed. It never outlives the session that asked for it, and is refused when that session ends
 * too soon to drive a turn.
 */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { signCliToken } from "../../session";
import { refuse, succeed } from "../result";
import type { Result } from "../types";

export interface CliTokenRequest {
  githubId: number;
  login: string;
  until: number;
}

export async function issueCliToken(
  env: Env,
  request: CliTokenRequest,
): Promise<Result<{ token: string; expiresAt: number }>> {
  const stub = ceremony(env);
  const state = await stub.snapshot();
  if (!state) return refuse("not-configured");
  if (state.phase === "FINALIZED") return refuse("finalized");
  const standing = state.identities[String(request.githubId)];
  if (standing?.banned) return refuse("banned");
  if (standing?.held) return refuse("held");
  if (!(await stub.linked(request.githubId))) return refuse("not-linked");
  const now = Date.now();
  if (request.until - now < SESSION_RULES.cliTokenMinMs) {
    return refuse("unauthenticated", "the session ends too soon: sign in again");
  }
  return succeed(
    signCliToken(env, { gid: request.githubId, login: request.login }, request.until, now),
  );
}
