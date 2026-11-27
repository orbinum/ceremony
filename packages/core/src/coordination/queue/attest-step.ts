/**
 * How an attestation for session `seq` ends that session: only if, once every deadline that passed
 * has applied, it is still the caller's slot; a session that lapsed meanwhile does not keep its
 * attestation out. None is taken from `closesAt` (the announced beacon time) on: the beacon cannot
 * be sealed before it, so a transcript downloaded after it is the one the beacon follows. That
 * cut-off is judged at `realNow`, the real time, while the slot is judged at `now`, the queue's
 * clock, which may be held at an earlier receipt. A sealed ceremony takes none either: its
 * transcript is final.
 */
import { step } from "./step";
import type { QueueState, StepResult } from "./types";

export function attestStep(
  state: QueueState,
  githubId: number,
  seq: number,
  now: number,
  closesAt: number,
  realNow: number = now,
): StepResult {
  if (state.phase === "FINALIZED") return { ok: false, state, refusal: "finalized" };
  if (realNow >= closesAt) return { ok: false, state, refusal: "attestation-closed" };
  const ticked = step(state, { type: "tick" }, now) as Extract<StepResult, { ok: true }>;
  const slot = ticked.state.slot;
  if (slot?.seq !== seq || slot.githubId !== githubId) return ticked;
  const r = step(ticked.state, { type: "finish", githubId }, now);
  return r.ok
    ? { ok: true, state: r.state, effects: [...ticked.effects, ...r.effects] }
    : { ok: false, state, refusal: r.refusal };
}
