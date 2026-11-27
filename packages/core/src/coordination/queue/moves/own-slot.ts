/** The caller's slot, or why it is not theirs. */
import type { QueueRefusal, Slot, StepContext } from "../types";

export const ownSlot = (ctx: StepContext, githubId: number): Slot | QueueRefusal =>
  ctx.s.slot?.githubId === githubId ? ctx.s.slot : "not-your-slot";
