/**
 * The alarm: schedule transitions, then whatever deadline of the session expired. Idempotent: it
 * only acts on what the state says has expired, so a repeated alarm changes nothing. No answer
 * from the verifier in time is `infra`, never the contributor's fault; closing ends the session
 * without penalty before any timer is looked at.
 */
import { grantNext, release, setPhase } from "../moves";
import { activeMs } from "../slot";
import type { StepContext } from "../types";
import { applyResult } from "./verifier";

export function tick(ctx: StepContext): null {
  const { s, now, rules } = ctx;
  if (s.phase === "SCHEDULED" && now >= s.schedule.openAt) setPhase(ctx, "OPEN", "schedule");
  if ((s.phase === "OPEN" || s.phase === "PAUSED") && now >= s.schedule.closeAt) {
    setPhase(ctx, "CLOSED", "schedule");
  }

  const slot = s.slot;
  if (slot && slot.verifyDeadline !== null && now >= slot.verifyDeadline) {
    applyResult(ctx, slot, "infra");
  }

  const live = s.slot;
  if (live && live.verifyDeadline === null) {
    const running = live.runningSince !== null;
    if (s.phase === "CLOSED") {
      release(ctx, "closed");
    } else if (
      s.phase === "OPEN" &&
      live.claimedAt === null &&
      now >= live.grantedAt + rules.claimWindowMs
    ) {
      release(ctx, "no-show");
    } else if (running && now >= live.lastHeartbeat + rules.heartbeatMs * rules.missedHeartbeats) {
      release(ctx, "no-show");
    } else if (running && activeMs(live, now) >= rules.activeCapMs) {
      release(ctx, "timeout");
    }
  }
  grantNext(ctx);
  return null;
}
