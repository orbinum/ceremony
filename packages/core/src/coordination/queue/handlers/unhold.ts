/** Lifts an identity's hold (`maxInfraResults`) once the operator has reviewed it, in any phase. */
import { grantNext, standing } from "../moves";
import type { QueueEvent, QueueRefusal, StepContext } from "../types";

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
