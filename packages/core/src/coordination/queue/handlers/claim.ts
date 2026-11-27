/** The holder claims the granted slot; the clock starts when the ceremony is open. */
import { ownSlot } from "../moves";
import { unfreeze } from "../slot";
import type { QueueEvent, QueueRefusal, StepContext } from "../types";

export function claim(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "claim" }>,
): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt !== null) return "already-claimed";
  slot.claimedAt = ctx.now;
  if (ctx.s.phase === "OPEN") unfreeze(slot, ctx.now);
  return null;
}
