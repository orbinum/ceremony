/** The operator's OPEN or PAUSED → CLOSED; a verification in flight may still finish. */
import { release, setPhase } from "../../moves";
import type { QueueRefusal, StepContext } from "../../types";

export function close(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "OPEN" && ctx.s.phase !== "PAUSED") return "invalid-transition";
  setPhase(ctx, "CLOSED", "operator");
  if (ctx.s.slot && ctx.s.slot.verifyDeadline === null) release(ctx, "closed");
  return null;
}
