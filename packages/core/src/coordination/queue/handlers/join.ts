/** Joining the queue: one place per identity, invited contributors ahead of everyone not invited. */
import { grantNext, standing } from "../moves";
import type { QueueEvent, QueueRefusal, StepContext } from "../types";

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
  if (s.circuits.every((c) => id.accepted.includes(c))) return "nothing-left";
  const entry = { githubId: e.githubId, enqueuedAt: now, invited: e.invited === true };
  const at = entry.invited ? s.queue.findIndex((q) => !q.invited) : -1;
  if (at === -1) s.queue.push(entry);
  else s.queue.splice(at, 0, entry);
  grantNext(ctx);
  return null;
}
