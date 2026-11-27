/**
 * Claiming a turn: the slot is the caller's from now on, and on success the verifier container is
 * started through `waitUntil`, so the turn's first upload does not wait for it.
 */
import { ceremony } from "../../durable";
import { warmVerifier } from "../../services";

export async function claimTurn(
  env: Env,
  githubId: number,
  waitUntil: (p: Promise<unknown>) => void,
) {
  const outcome = await ceremony(env).apply({ type: "claim", githubId });
  if (outcome.ok) waitUntil(warmVerifier(env));
  return outcome;
}
