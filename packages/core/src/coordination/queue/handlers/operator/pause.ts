/** The operator's OPEN → PAUSED; the session clock stops. */
import { setPhase } from "../../moves";
import { freeze } from "../../slot";
import type { QueueRefusal, StepContext } from "../../types";

export function pause(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "OPEN") return "invalid-transition";
  ctx.s.pausedBy = "operator";
  setPhase(ctx, "PAUSED", "operator");
  if (ctx.s.slot) freeze(ctx.s.slot, ctx.now);
  return null;
}
