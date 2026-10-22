/** The holder's own moves: claim, heartbeat, finish. SPEC §4.2. */
import { grantNext, ownSlot, release, type StepContext } from "../context";
import { unfreeze } from "../slot";
import type { QueueEvent, QueueRefusal } from "../types";

type Holder = Extract<QueueEvent, { type: "claim" | "heartbeat" | "finish" }>;

/** Claims the granted slot; the clock starts when the ceremony is open. */
export function claim(ctx: StepContext, e: Holder): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt !== null) return "already-claimed";
  slot.claimedAt = ctx.now;
  if (ctx.s.phase === "OPEN") unfreeze(slot, ctx.now);
  return null;
}

/** Keeps a claimed session alive. */
export function heartbeat(ctx: StepContext, e: Holder): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt === null) return "not-claimed";
  slot.lastHeartbeat = ctx.now;
  return null;
}

/** Ends the session early (not while a verification is in flight). */
export function finish(ctx: StepContext, e: Holder): QueueRefusal | null {
  const slot = ownSlot(ctx, e.githubId);
  if (typeof slot === "string") return slot;
  if (slot.verifyDeadline !== null) return "busy";
  release(ctx, "finished");
  grantNext(ctx);
  return null;
}
