/**
 * A contributor's CLI token (SPEC §4.4): only for an identity whose wallet is linked (steps 1–2
 * are done in the browser), not to a banned or held one, and never once the ceremony is sealed.
 */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { signCliToken } from "../session";
import { refuse, type Result, succeed } from "./result";

/** Who asks, from the browser, and until when their session holds. */
export interface CliTokenRequest {
  githubId: number;
  login: string;
  until: number;
}

/** Mints the token; it never outlives the session that asked for it. */
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
  // Never a token too short to drive a session (the session may also have lapsed meanwhile).
  if (request.until - now < SESSION_RULES.cliTokenMinMs) {
    return refuse("unauthenticated", "the session ends too soon: sign in again");
  }
  return succeed(
    signCliToken(env, { gid: request.githubId, login: request.login }, request.until, now),
  );
}
