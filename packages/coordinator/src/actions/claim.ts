/**
 * Claiming a turn (SPEC §4.1): the slot is the caller's from now on, and the verifier container is
 * started meanwhile, so the turn's first upload does not wait for it.
 */
import { ceremony } from "../durable";
import { warmVerifier } from "../services";

/** Claims `githubId`'s slot; on success, warms the verifier through `waitUntil`. */
export async function claimTurn(
  env: Env,
  githubId: number,
  waitUntil: (p: Promise<unknown>) => void,
) {
  const outcome = await ceremony(env).apply({ type: "claim", githubId });
  if (outcome.ok) waitUntil(warmVerifier(env));
  return outcome;
}
