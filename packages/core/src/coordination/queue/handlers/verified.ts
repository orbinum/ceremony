/**
 * A verifier result, taken only for the upload in flight (same session, circuit and upload id);
 * anything else is stale.
 */
import { grantNext } from "../moves";
import { verifying } from "../slot";
import type { QueueEvent, QueueRefusal, StepContext } from "../types";
import { applyResult } from "./apply-result";

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
