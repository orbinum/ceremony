/**
 * Gives the free slot to the next eligible contributor, offering only the circuits it has not had
 * accepted yet; banned, held, cooling-down or finished entries are dropped on the way.
 */
import type { StepContext } from "../types";
import { standing } from "./standing";

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
