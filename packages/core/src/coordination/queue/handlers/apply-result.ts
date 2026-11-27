/**
 * Applies a verification result to the circuit in flight. `valid` accepts it; `rejected` consumes
 * the attempt (one retry, then the circuit is skipped; repeated across sessions, a ban);
 * `ambiguous` gives the attempt back but counts toward the session's infra bound, so the free
 * re-upload is not endless; `infra` gives it back, pauses the ceremony and counts on the identity
 * at once (so ending the session another way changes nothing). After `infraPerSession` of either
 * the session is released, so one session cannot stall the ceremony again and again; once closed
 * it ends as `closed`, since closing never counts as a no-show.
 */
import type { VerificationResult } from "../../../verification";
import { finishIfDone, release, setPhase, standing } from "../moves";
import { unfreeze, verifying } from "../slot";
import type { Slot, StepContext } from "../types";

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
      entry.infra += 1;
      if (slot.circuits.reduce((n, c) => n + c.infra, 0) >= ctx.rules.infraPerSession) {
        release(ctx, ctx.s.phase === "CLOSED" ? "closed" : "infra");
        return;
      }
      break;
    case "infra":
      entry.status = "todo";
      entry.attempts -= 1;
      entry.infra += 1;
      id.infraResults += 1;
      if (id.infraResults >= ctx.rules.maxInfraResults) id.held = true;
      if (ctx.s.phase === "OPEN") {
        ctx.s.pausedBy = "verifier";
        setPhase(ctx, "PAUSED", "verifier unavailable");
      }
      if (id.held || slot.circuits.reduce((n, c) => n + c.infra, 0) >= ctx.rules.infraPerSession) {
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
