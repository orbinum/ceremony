/** An upload sends the next circuit in order to verification; the clock freezes until the result. */
import { ownIdleSlot } from "../../moves";
import { freeze } from "../../slot";
import type { QueueEvent, QueueRefusal, StepContext } from "../../types";

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
