/** Operator transitions (pause, resume, close, finalize, SPEC §4.3) and lifting a hold (§4.2). */
import { grantNext, release, setPhase, standing, type StepContext } from "../context";
import { freeze, unfreeze } from "../slot";
import type { QueueEvent, QueueRefusal } from "../types";

/** OPEN → PAUSED; the session clock stops. */
export function pause(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "OPEN") return "invalid-transition";
  ctx.s.pausedBy = "operator";
  setPhase(ctx, "PAUSED", "operator");
  if (ctx.s.slot) freeze(ctx.s.slot, ctx.now);
  return null;
}

/** PAUSED → OPEN; an unclaimed slot gets a fresh claim window, an idle one its clock back. */
export function resume(ctx: StepContext): QueueRefusal | null {
  const { s, now } = ctx;
  if (s.phase !== "PAUSED") return "invalid-transition";
  s.pausedBy = null;
  setPhase(ctx, "OPEN", "operator");
  if (s.slot && s.slot.claimedAt === null) s.slot.grantedAt = now;
  if (s.slot && s.slot.verifyDeadline === null) unfreeze(s.slot, now);
  grantNext(ctx);
  return null;
}

/** OPEN or PAUSED → CLOSED; a verification in flight may still finish. */
export function close(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "OPEN" && ctx.s.phase !== "PAUSED") return "invalid-transition";
  setPhase(ctx, "CLOSED", "operator");
  if (ctx.s.slot && ctx.s.slot.verifyDeadline === null) release(ctx, "closed");
  return null;
}

/** Lifts an identity's hold (`maxInfraResults`) once the operator has reviewed it; any phase. */
export function unhold(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "unhold" }>,
): QueueRefusal | null {
  const id = standing(ctx.s, e.githubId);
  if (!id.held) return "invalid-transition";
  id.held = false;
  id.infraResults = 0;
  grantNext(ctx);
  return null;
}

/**
 * CLOSED → FINALIZED, once no session is left. The sealed beacon records the transition (no
 * `state` record): it is the transcript's last record, the one every final binds to.
 */
export function finalize(ctx: StepContext): QueueRefusal | null {
  if (ctx.s.phase !== "CLOSED" || ctx.s.slot) return "invalid-transition";
  ctx.s.phase = "FINALIZED";
  ctx.effects.push({ type: "finalized" });
  return null;
}
