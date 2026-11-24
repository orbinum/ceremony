/**
 * Which queue events each caller may send, and how an attestation ends a session.
 * SPEC §3.5, §4.1, §4.3.
 */
import { step } from "./machine";
import type { QueueEvent, QueueState, StepResult } from "./types";

/**
 * The operator's state actions (`POST /admin/state`). Finalizing takes the sealed beacon and the
 * finals, so it has its own route (`POST /admin/finalize`).
 */
export const OPERATOR_ACTIONS = ["pause", "resume", "close"] as const;

/**
 * Why a contributor or operator may not send `event` directly, or null if they may: uploads,
 * results and finalization enter only through their own checked paths, and only a GitHub identity
 * with a linked wallet may join the queue (SPEC §4.1 steps 1–3).
 */
export function clientEventRefusal(
  event: QueueEvent,
  linked: boolean,
): "invalid-transition" | "not-linked" | null {
  if (event.type === "uploaded" || event.type === "verified" || event.type === "finalize") {
    return "invalid-transition";
  }
  return event.type === "join" && !linked ? "not-linked" : null;
}

/**
 * An attestation for session `seq` also ends that session if, once every deadline that passed
 * has applied, it is still the caller's slot; a session that lapsed meanwhile does not keep its
 * attestation out. None is taken from `closesAt` (the announced beacon time) on: the beacon cannot
 * be sealed before it, so a transcript downloaded after it is the one the beacon follows. A sealed
 * ceremony takes none either: its transcript is final.
 */
export function attestStep(
  state: QueueState,
  githubId: number,
  seq: number,
  now: number,
  closesAt: number,
): StepResult {
  if (state.phase === "FINALIZED") return { ok: false, state, refusal: "finalized" };
  if (now >= closesAt) return { ok: false, state, refusal: "attestation-closed" };
  const ticked = step(state, { type: "tick" }, now) as Extract<StepResult, { ok: true }>;
  const slot = ticked.state.slot;
  if (slot?.seq !== seq || slot.githubId !== githubId) return ticked;
  const r = step(ticked.state, { type: "finish", githubId }, now);
  return r.ok
    ? { ok: true, state: r.state, effects: [...ticked.effects, ...r.effects] }
    : { ok: false, state, refusal: r.refusal };
}
