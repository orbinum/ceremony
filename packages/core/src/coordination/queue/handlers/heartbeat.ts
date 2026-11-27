/** The holder keeps a claimed session alive. */
import { ownSlot } from "../moves";
import type { QueueEvent, QueueRefusal, StepContext } from "../types";

export function heartbeat(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "heartbeat" }>,
): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt === null) return "not-claimed";
  slot.lastHeartbeat = ctx.now;
  return null;
}
