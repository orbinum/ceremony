/** Joining and leaving the queue. SPEC §4.1. */
import { CIRCUIT_ORDER } from "../../../config";
import { grantNext, release, standing, type StepContext } from "../context";
import type { QueueEvent, QueueRefusal } from "../types";

/** One place per identity; invited contributors go ahead of everyone not invited. */
export function join(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "join" }>,
): QueueRefusal | null {
  const { s, now } = ctx;
  if (s.phase !== "OPEN" && s.phase !== "PAUSED") return "not-open";
  const id = standing(s, e.githubId);
  if (id.banned) return "banned";
  if (id.held) return "held";
  if (id.cooldownUntil > now) return "cooldown";
  if (s.slot?.githubId === e.githubId || s.queue.some((q) => q.githubId === e.githubId)) {
    return "already-queued";
  }
  if (CIRCUIT_ORDER.every((c) => id.accepted.includes(c))) return "nothing-left";
  const entry = { githubId: e.githubId, enqueuedAt: now, invited: e.invited === true };
  const at = entry.invited ? s.queue.findIndex((q) => !q.invited) : -1;
  if (at === -1) s.queue.push(entry);
  else s.queue.splice(at, 0, entry);
  grantNext(ctx);
  return null;
}

/** Leaves the queue, or ends one's own session (not while a verification is in flight). */
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
