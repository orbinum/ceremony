/** The caller's claimed slot while it is idle (not verifying), or why not. */
import type { QueueRefusal, Slot, StepContext } from "../types";
import { ownSlot } from "./own-slot";

export function ownIdleSlot(ctx: StepContext, githubId: number): Slot | QueueRefusal {
  const slot = ownSlot(ctx, githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt === null) return "not-claimed";
  if (slot.verifyDeadline !== null) return "busy";
  return slot;
}
