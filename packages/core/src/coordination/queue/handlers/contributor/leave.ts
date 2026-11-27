/** Leaving the queue, or ending one's own session (not while a verification is in flight). */
import { grantNext, release } from "../../moves";
import type { QueueEvent, QueueRefusal, StepContext } from "../../types";

export function leave(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "leave" }>,
): QueueRefusal | null {
  const { s } = ctx;
  if (s.slot?.githubId === e.githubId) {
    if (s.slot.verifyDeadline !== null) return "busy";
    release(ctx, "finished");
    grantNext(ctx);
  } else {
    s.queue = s.queue.filter((q) => q.githubId !== e.githubId);
  }
  return null;
}
