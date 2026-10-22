/**
 * The alarm: schedule transitions, then whatever deadline of the session expired. Idempotent: it
 * only acts on what the state says has expired, so a repeated alarm changes nothing. SPEC §4.2–4.3.
 */
import { grantNext, release, setPhase, type StepContext } from "../context";
import { activeMs } from "../slot";
import { applyResult } from "./verification";

/** Advances the queue to `ctx.now`. */
export function tick(ctx: StepContext): null {
  const { s, now, rules } = ctx;
  if (s.phase === "SCHEDULED" && now >= s.schedule.openAt) setPhase(ctx, "OPEN", "schedule");
  if ((s.phase === "OPEN" || s.phase === "PAUSED") && now >= s.schedule.closeAt) {
    setPhase(ctx, "CLOSED", "schedule");
  }

  const slot = s.slot;
  // No answer from the verifier in time: `infra`, never the contributor's fault.
  if (slot && slot.verifyDeadline !== null && now >= slot.verifyDeadline) {
    applyResult(ctx, slot, "infra");
  }

  const live = s.slot;
  if (live && live.verifyDeadline === null) {
    const running = live.runningSince !== null;
    if (s.phase === "CLOSED") {
      // Closing ends the session without penalty, before any timer is looked at.
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
