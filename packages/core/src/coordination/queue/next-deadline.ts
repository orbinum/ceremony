/**
 * When the Durable Object's single alarm must fire next: the earliest pending deadline, or null
 * when nothing is pending. The alarm then runs `tick`, which re-derives what expired.
 */
import { QUEUE_RULES } from "../../config";
import { activeMs } from "./slot";
import type { QueueRules, QueueState } from "./types";

export function nextDeadline(s: QueueState, rules: QueueRules = QUEUE_RULES): number | null {
  const at: number[] = [];
  if (s.phase === "SCHEDULED") at.push(s.schedule.openAt);
  if (s.phase === "OPEN" || s.phase === "PAUSED") at.push(s.schedule.closeAt);
  const slot = s.slot;
  if (slot) {
    if (slot.verifyDeadline !== null) at.push(slot.verifyDeadline);
    if (s.phase === "OPEN" && slot.claimedAt === null) {
      at.push(slot.grantedAt + rules.claimWindowMs);
    }
    if (slot.runningSince !== null) {
      at.push(slot.lastHeartbeat + rules.heartbeatMs * rules.missedHeartbeats);
      at.push(slot.runningSince + (rules.activeCapMs - activeMs(slot, slot.runningSince)));
    }
  }
  return at.length === 0 ? null : Math.min(...at);
}
