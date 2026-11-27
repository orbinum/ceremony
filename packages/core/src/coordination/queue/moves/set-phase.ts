/** Moves the ceremony to another phase, recording why as a `state` effect. */
import type { CeremonyState } from "../../../ceremony";
import type { StepContext } from "../types";

export function setPhase(ctx: StepContext, to: CeremonyState, reason: string): void {
  ctx.effects.push({ type: "state", from: ctx.s.phase, to, reason });
  ctx.s.phase = to;
}
