/** The mutable context of one step and the moves every handler shares. */
import type { CeremonyState } from "../../ceremony";
import type {
  IdentityStanding,
  QueueEffect,
  QueueRefusal,
  QueueRules,
  QueueState,
  ReleaseReason,
  Slot,
} from "./types";

/** One step: a private copy of the state, the effects so far, the time and the rules. */
export interface StepContext {
  s: QueueState;
  effects: QueueEffect[];
  now: number;
  rules: QueueRules;
}

/** An identity's standing, created on first sight. Own properties only (no prototype keys). */
export function standing(s: QueueState, githubId: number): IdentityStanding {
  const key = String(githubId);
  if (!Object.hasOwn(s.identities, key)) {
    s.identities[key] = {
      noShows: 0,
      cooldownUntil: 0,
      rejected: 0,
      banned: false,
      infraResults: 0,
      held: false,
      accepted: [],
    };
  }
  const id = s.identities[key] as IdentityStanding;
  // A standing stored before these fields existed.
  id.infraResults ??= 0;
  id.held ??= false;
  return id;
}

/** Moves the ceremony to `to`, recording why. */
export function setPhase(ctx: StepContext, to: CeremonyState, reason: string): void {
  ctx.effects.push({ type: "state", from: ctx.s.phase, to, reason });
  ctx.s.phase = to;
}

/**
 * Ends the session. A no-show, a timeout or a release for repeated `infra` counts towards a
 * cooldown (the last so that an upload that reliably stalls the verifier cannot pause the
 * ceremony every turn); nothing is ever counted as a rejection but a rejection.
 */
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

/** The next eligible contributor gets the slot; ineligible entries are dropped on the way. */
export function grantNext(ctx: StepContext): void {
  const { s } = ctx;
  while (s.phase === "OPEN" && !s.slot && s.queue.length > 0) {
    const entry = s.queue.shift();
    if (!entry) break;
    const id = standing(s, entry.githubId);
    if (id.banned || id.held || id.cooldownUntil > ctx.now) continue;
    const circuits = s.circuits.filter((c) => !id.accepted.includes(c));
    if (circuits.length === 0) continue;
    s.slot = {
      seq: s.nextSeq++,
      githubId: entry.githubId,
      grantedAt: ctx.now,
      claimedAt: null,
      lastHeartbeat: ctx.now,
      activeMs: 0,
      runningSince: null,
      circuits: circuits.map((circuit) => ({
        circuit,
        status: "todo",
        attempts: 0,
        uploads: 0,
        infra: 0,
      })),
      verifyDeadline: null,
    };
    ctx.effects.push({ type: "grant", githubId: entry.githubId, seq: s.slot.seq });
  }
}

/** Ends the session once nothing is left to do. */
export function finishIfDone(ctx: StepContext): void {
  const slot = ctx.s.slot;
  if (slot?.circuits.every((c) => c.status === "accepted" || c.status === "skipped")) {
    release(ctx, "finished");
  }
}

/** The caller's slot, or why it is not theirs. */
export const ownSlot = (ctx: StepContext, githubId: number): Slot | QueueRefusal =>
  ctx.s.slot?.githubId === githubId ? ctx.s.slot : "not-your-slot";

/** The caller's claimed slot, idle (not verifying), or why not. */
export function ownIdleSlot(ctx: StepContext, githubId: number): Slot | QueueRefusal {
  const slot = ownSlot(ctx, githubId);
  if (typeof slot === "string") return slot;
  if (slot.claimedAt === null) return "not-claimed";
  if (slot.verifyDeadline !== null) return "busy";
  return slot;
}
