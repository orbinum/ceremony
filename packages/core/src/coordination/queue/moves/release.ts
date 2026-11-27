/**
 * Ends the session. A no-show, a timeout or a release for repeated `infra` counts towards a
 * cooldown (the last so that an upload that reliably stalls the verifier cannot pause the ceremony
 * every turn); nothing is ever counted as a rejection but a rejection.
 */
import type { ReleaseReason, StepContext } from "../types";
import { standing } from "./standing";

export function release(ctx: StepContext, reason: ReleaseReason): void {
  const slot = ctx.s.slot;
  if (!slot) return;
  if (reason === "no-show" || reason === "timeout" || reason === "infra") {
    const id = standing(ctx.s, slot.githubId);
    id.noShows += 1;
    if (id.noShows >= ctx.rules.noShowsForCooldown) {
      id.cooldownUntil = ctx.now + ctx.rules.cooldownMs;
      id.noShows = 0;
    }
  }
  ctx.effects.push({ type: "release", githubId: slot.githubId, seq: slot.seq, reason });
  ctx.s.slot = null;
}
