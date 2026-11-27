/**
 * CLOSED → FINALIZED, once no session is left. The sealed beacon records the transition (no
 * `state` record): it is the transcript's last record, the one every final binds to.
 */
import type { QueueRefusal, StepContext } from "../types";

export function finalize(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "CLOSED" || ctx.s.slot) return "invalid-transition";
  ctx.s.phase = "FINALIZED";
  ctx.effects.push({ type: "finalized" });
  return null;
}
