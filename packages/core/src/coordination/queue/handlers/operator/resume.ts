/** The operator's PAUSED → OPEN; an unclaimed slot gets a fresh claim window, an idle one its clock back. */
import { grantNext, setPhase } from "../../moves";
import { unfreeze } from "../../slot";
import type { QueueRefusal, StepContext } from "../../types";

export function resume(ctx: StepContext): QueueRefusal | null {
  const { s, now } = ctx;
  if (s.phase !== "PAUSED") return "invalid-transition";
  s.pausedBy = null;
  setPhase(ctx, "OPEN", "operator");
  if (s.slot && s.slot.claimedAt === null) s.slot.grantedAt = now;
  if (s.slot && s.slot.verifyDeadline === null) unfreeze(s.slot, now);
  grantNext(ctx);
  return null;
}
