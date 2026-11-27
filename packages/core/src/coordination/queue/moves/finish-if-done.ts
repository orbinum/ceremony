/** Ends the session once each of its circuits is accepted or skipped. */
import type { StepContext } from "../types";
import { release } from "./release";

export function finishIfDone(ctx: StepContext): void {
  const slot = ctx.s.slot;
  if (slot?.circuits.every((c) => c.status === "accepted" || c.status === "skipped")) {
    release(ctx, "finished");
  }
}
