/** Uploads and their results (SPEC §2.5 result contract, §4.2). */
import type { VerificationResult } from "../../../verification";
import {
  finishIfDone,
  grantNext,
  ownIdleSlot,
  release,
  setPhase,
  standing,
  type StepContext,
} from "../context";
import { freeze, unfreeze, verifying } from "../slot";
import type { QueueEvent, QueueRefusal, Slot } from "../types";

/** The next circuit in order goes to verification; the clock freezes until the result. */
export function uploaded(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "uploaded" }>,
): QueueRefusal | null {
  if (ctx.s.phase !== "OPEN") return "not-open";
  const slot = ownIdleSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  const next = slot.circuits.find((c) => c.status === "todo");
  if (next?.circuit !== e.circuit) return "out-of-order";
  next.status = "verifying";
  next.attempts += 1;
  next.uploads += 1;
  freeze(slot, ctx.now);
  slot.verifyDeadline = ctx.now + ctx.rules.verifyDeadlineMs;
  ctx.effects.push({
    type: "dispatch",
    githubId: slot.githubId,
    seq: slot.seq,
    circuit: next.circuit,
    attempt: next.uploads,
  });
  return null;
}

/**
 * Applies a result to the circuit in flight. `valid` accepts it; `rejected` consumes the attempt
 * (one retry, then the circuit is skipped; repeated across sessions → ban); `ambiguous` gives the
 * attempt back; `infra` gives it back and pauses the ceremony, and after `infraPerSession` of
 * them (any circuits) the session is released so one session cannot stall the ceremony again and
 * again.
 */
export function applyResult(
  ctx: StepContext,
  slot: Slot,
  outcome: VerificationResult["result"],
): void {
  const entry = verifying(slot);
  if (!entry) return;
  slot.verifyDeadline = null;
  const id = standing(ctx.s, slot.githubId);
  switch (outcome) {
    case "valid":
      entry.status = "accepted";
      id.accepted.push(entry.circuit);
      ctx.effects.push({
        type: "accepted",
        githubId: slot.githubId,
        seq: slot.seq,
        circuit: entry.circuit,
      });
      break;
    case "rejected":
      id.rejected += 1;
      entry.status = entry.attempts >= ctx.rules.attemptsPerCircuit ? "skipped" : "todo";
      if (id.rejected >= ctx.rules.maxRejected) {
        id.banned = true;
        release(ctx, "banned");
        return;
      }
      break;
    case "ambiguous":
      entry.status = "todo";
      entry.attempts -= 1;
      break;
    case "infra":
      entry.status = "todo";
      entry.attempts -= 1;
      entry.infra += 1;
      // Counted on the identity at once, so ending the session another way changes nothing.
      id.infraResults += 1;
      if (id.infraResults >= ctx.rules.maxInfraResults) id.held = true;
      if (ctx.s.phase === "OPEN") {
        ctx.s.pausedBy = "verifier";
        setPhase(ctx, "PAUSED", "verifier unavailable");
      }
      if (id.held || slot.circuits.reduce((n, c) => n + c.infra, 0) >= ctx.rules.infraPerSession) {
        // Once closed, the session ends as `closed`: closing never counts as a no-show.
        release(ctx, ctx.s.phase === "CLOSED" ? "closed" : "infra");
        return;
      }
      break;
  }
  if (ctx.s.phase === "CLOSED") release(ctx, "closed");
  else {
    if (ctx.s.phase === "OPEN") unfreeze(slot, ctx.now);
    finishIfDone(ctx);
  }
}

/** A verifier result: only for the upload in flight (same session, circuit and upload id). */
export function verified(
  ctx: StepContext,
  e: Extract<QueueEvent, { type: "verified" }>,
): QueueRefusal | null {
  const slot = ctx.s.slot;
  const entry = slot && verifying(slot);
  if (
    !slot ||
    !entry ||
    slot.seq !== e.seq ||
    entry.circuit !== e.circuit ||
    entry.uploads !== e.attempt
  ) {
    return "no-verification";
  }
  applyResult(ctx, slot, e.outcome);
  grantNext(ctx);
  return null;
}
