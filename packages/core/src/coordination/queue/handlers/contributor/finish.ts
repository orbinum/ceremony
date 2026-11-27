/** The holder ends the session early (not while a verification is in flight). */
import { grantNext, ownSlot, release } from "../../moves";
import type { QueueEvent, QueueRefusal, StepContext } from "../../types";

export function finish(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "finish" }>,
): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.verifyDeadline !== null) return "busy";
  release(ctx, "finished");
  grantNext(ctx);
  return null;
}
