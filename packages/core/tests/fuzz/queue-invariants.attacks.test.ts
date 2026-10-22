/**
 * Attacks the queue machine with long random sequences under adversarial clocks (duplicate times,
 * exact deadline hits, and times that run backwards), checking the SPEC §4.2–4.3 rules after
 * every step: deadlines-first equivalence, frozen clock, cooldowns, infra release, bans, close
 * never a no-show, nothing accepted after T_close, FINALIZED refusing everything, and
 * `nextDeadline` being exactly the earliest pending deadline.
 */
import { describe, expect, it } from "vitest";
import { CIRCUIT_ORDER, QUEUE_RULES } from "../../src/config";
import {
  attestStep,
  initialQueue,
  nextDeadline,
  type QueueEffect,
  type QueueEvent,
  type QueueState,
  type StepResult,
  step,
} from "../../src/coordination/queue";
import { ensure, mulberry32, pick } from "../support";

const R = QUEUE_RULES;
const OPEN = 10_000_000;
const IDS = [1, 2, 3, 4, 5];
const OUTCOMES = ["valid", "rejected", "ambiguous", "infra"] as const;
const COUNTED = new Set(["no-show", "timeout", "infra"]);

type Ev = QueueEvent | { type: "attest"; githubId: number; seq: number };

const snap = (s: QueueState) => JSON.stringify(s);
const activeOf = (s: QueueState, t: number) =>
  s.slot ? s.slot.activeMs + (s.slot.runningSince === null ? 0 : t - s.slot.runningSince) : 0;

function randomEvent(s: QueueState, rand: () => number, stall: boolean): Ev {
  const githubId = IDS[pick(rand, IDS.length)] as number;
  const slot = s.slot;
  const holder = slot && rand() < 0.85 ? slot.githubId : githubId;
  // A staller keeps its slot alive with heartbeats and never uploads or finishes: the cap ends it.
  if (stall && slot && slot.claimedAt !== null && rand() < 0.97) {
    return { type: "heartbeat", githubId: slot.githubId };
  }
  // Bias towards the session's natural next move, so long sessions and acceptances happen.
  if (slot && rand() < 0.45) {
    const v = slot.circuits.find((c) => c.status === "verifying");
    const next = slot.circuits.find((c) => c.status === "todo");
    if (slot.claimedAt === null) return { type: "claim", githubId: slot.githubId };
    if (v) {
      const outcome = rand() < 0.55 ? "valid" : (OUTCOMES[pick(rand, 4)] as "valid");
      return { type: "verified", seq: slot.seq, circuit: v.circuit, attempt: v.uploads, outcome };
    }
    if (next) return { type: "uploaded", githubId: slot.githubId, circuit: next.circuit };
  }
  switch (pick(rand, 14)) {
    case 0:
    case 1:
      return { type: "join", githubId, invited: rand() < 0.1 };
    case 2:
      return { type: "leave", githubId: rand() < 0.3 ? holder : githubId };
    case 3:
      return { type: "claim", githubId: holder };
    case 4:
    case 5:
      return { type: "heartbeat", githubId: holder };
    case 6: {
      const next = slot?.circuits.find((c) => c.status === "todo");
      const circuit =
        rand() < 0.85 ? (next?.circuit ?? "shield") : (CIRCUIT_ORDER[pick(rand, 3)] as "shield");
      return { type: "uploaded", githubId: holder, circuit };
    }
    case 7:
    case 8: {
      const v = slot?.circuits.find((c) => c.status === "verifying");
      // Mostly the job in flight; sometimes a late or forged one (other seq, circuit or attempt).
      const forged = rand() < 0.15;
      return {
        type: "verified",
        seq: forged ? pick(rand, 4) : (slot?.seq ?? 0),
        circuit: forged || !v ? (CIRCUIT_ORDER[pick(rand, 3)] as "shield") : v.circuit,
        attempt: forged || !v ? pick(rand, 4) : v.uploads,
        outcome: OUTCOMES[pick(rand, 4)] as "valid",
      };
    }
    case 9:
      return { type: "finish", githubId: holder };
    case 10: {
      const r = rand();
      return { type: r < 0.35 ? "pause" : r < 0.97 ? "resume" : "close" };
    }
    case 11:
      return { type: rand() < 0.5 ? "finalize" : "tick" };
    case 12:
      return rand() < 0.8
        ? { type: "attest", githubId: holder, seq: slot?.seq ?? pick(rand, 4) }
        : { type: "unhold", githubId };
    default:
      return { type: "tick" };
  }
}

const run = (s: QueueState, e: Ev, t: number): StepResult =>
  e.type === "attest" ? attestStep(s, e.githubId, e.seq, t) : step(s, e, t);

/** The next time: duplicates, small steps, exact deadline hits and misses, jumps, and (if allowed) going back. */
function nextTime(
  s: QueueState,
  t: number,
  rand: () => number,
  backwards: boolean,
  brisk: number,
): number {
  const nd = nextDeadline(s);
  // A brisk run: events seconds apart, so heartbeats keep sessions alive up to their cap.
  if (rand() < brisk) return t + pick(rand, 20_000);
  const r = rand();
  if (r < 0.1) return t;
  if (r < 0.45) return t + pick(rand, 35_000);
  if (r < 0.6) return t + pick(rand, 180_000);
  if (r < 0.7 && nd !== null && nd >= t) return nd;
  if (r < 0.75 && nd !== null && nd - 1 >= t) return nd - 1;
  if (r < 0.82) return t + pick(rand, 30 * 60_000);
  if (backwards && r < 0.97) return Math.max(0, t - pick(rand, 300_000));
  return t + 1;
}

const isChange = (before: QueueState, r: StepResult) =>
  r.ok && (r.effects.length > 0 || snap(r.state) !== snap(before));

interface Shadow {
  /** Counted releases since the last cooldown, per identity (model of SPEC §4.2). */
  counted: Map<number, number>;
  maxActive: Map<number, number>;
}

function checkStep(
  s: QueueState,
  e: Ev,
  t: number,
  r: StepResult,
  shadow: Shadow,
  monotonic: boolean,
): void {
  // FINALIZED refuses everything; a tick there changes nothing.
  if (s.phase === "FINALIZED") {
    if (e.type === "tick") {
      ensure(
        r.ok && r.effects.length === 0 && snap(r.state) === snap(s),
        "tick after FINALIZED is a no-op",
      );
    } else {
      ensure(!r.ok && r.refusal === "finalized" && r.state === s, `FINALIZED refuses ${e.type}`);
    }
    return;
  }
  // Deadlines first: the event at t is the event applied to the state ticked to t.
  const ticked = step(s, { type: "tick" }, t);
  ensure(ticked.ok, "a tick is never refused");
  if (e.type !== "tick" && e.type !== "attest" && ticked.ok) {
    const viaTick = step(ticked.state, e, t);
    ensure(viaTick.ok === r.ok, `deadlines-first: ${e.type} ok differs`);
    if (r.ok && viaTick.ok) {
      ensure(snap(viaTick.state) === snap(r.state), `deadlines-first: ${e.type} state differs`);
    }
    if (!r.ok && !viaTick.ok) ensure(viaTick.refusal === r.refusal, "deadlines-first refusal");
  }
  if (!r.ok) {
    ensure(r.state === s, "a refused event keeps the same state");
    return;
  }
  const after = r.state;
  const pre = ticked.ok ? ticked.state : s;
  const effects: QueueEffect[] = r.effects;

  // Every grant goes to an eligible identity.
  const grants = effects.filter((x) => x.type === "grant");
  // (Two grants in one step are legitimate: a deadline releases A and grants B, then B's own event
  // ends B's session and grants C.)
  for (const g of grants) {
    if (g.type !== "grant") continue;
    const id = after.identities[String(g.githubId)];
    ensure(!id?.banned, "a banned identity is never granted");
    ensure(!id?.held, "a held identity is never granted");
    ensure((id?.cooldownUntil ?? 0) <= t, "an identity on cooldown is never granted");
  }
  if (after.slot) {
    const slot = after.slot;
    ensure(!after.queue.some((q) => q.githubId === slot.githubId), "holder not also queued");
    const inFlight = slot.circuits.filter((c) => c.status === "verifying").length;
    ensure(inFlight <= 1, "one verification in flight");
    ensure((slot.verifyDeadline !== null) === (inFlight === 1), "verify deadline iff verifying");
    // The clock is frozen while verifying, paused or unclaimed.
    if (slot.verifyDeadline !== null || after.phase !== "OPEN" || slot.claimedAt === null) {
      ensure(slot.runningSince === null, "clock frozen while verifying, paused or unclaimed");
    }
    ensure(
      slot.circuits.reduce((n, c) => n + c.infra, 0) < R.infraPerSession,
      "a second infra in a session releases it",
    );
    for (const c of slot.circuits) {
      ensure(c.attempts <= R.attemptsPerCircuit, "one retry after rejected");
      ensure(
        !(after.identities[String(slot.githubId)]?.accepted ?? []).includes(c.circuit) ||
          c.status === "accepted",
        "an accepted circuit is never offered again",
      );
    }
    ensure(slot.activeMs >= 0, "active time is never negative");
    const prev = shadow.maxActive.get(slot.seq) ?? 0;
    ensure(slot.activeMs >= prev, "the stored active time never runs backwards");
    shadow.maxActive.set(slot.seq, slot.activeMs);
    if (monotonic) {
      ensure(activeOf(after, t) < R.activeCapMs, "the active cap is applied");
    }
  }

  // The ban: 3 rejected, never granted again.
  for (const [k, id] of Object.entries(after.identities)) {
    ensure(id.banned === id.rejected >= R.maxRejected, `ban iff 3 rejected (${k})`);
    ensure(id.held === id.infraResults >= R.maxInfraResults, `held iff 6 infra results (${k})`);
    ensure(new Set(id.accepted).size === id.accepted.length, "each circuit accepted once");
  }

  // Head moves only on `valid` for the circuit in flight, inside the acceptance window.
  const accepted = effects.filter((x) => x.type === "accepted");
  const flight = pre.slot?.circuits.find((c) => c.status === "verifying");
  const matches =
    e.type === "verified" &&
    pre.slot?.seq === e.seq &&
    flight?.circuit === e.circuit &&
    flight.uploads === e.attempt;
  if (accepted.length > 0) {
    ensure(accepted.length === 1, "one acceptance per step");
    ensure(
      matches && e.type === "verified" && e.outcome === "valid",
      "accepted only on valid in flight",
    );
    ensure(t < after.schedule.closeAt + R.verifyDeadlineMs, "nothing accepted after the window");
    ensure(
      pre.slot !== null && t < (pre.slot.verifyDeadline ?? -Infinity),
      "accepted before its verify deadline",
    );
  } else if (matches && e.type === "verified" && e.outcome === "valid") {
    ensure(false, "a valid result for the job in flight is accepted");
  }
  for (const d of effects) {
    if (d.type === "dispatch") {
      ensure(t < after.schedule.closeAt, "no upload accepted at or after T_close");
      ensure(after.phase === "OPEN", "uploads only while OPEN");
    }
  }

  // Closing never counts as a no-show; close and the release are in the same step.
  // (T_close by schedule: before any timer; an operator close: after the deadlines that passed.)
  const scheduleClose =
    s.phase === "CLOSED" ||
    effects.some((x) => x.type === "state" && x.to === "CLOSED" && x.reason === "schedule");
  const own = e.type === "close" && ticked.ok ? effects.slice(ticked.effects.length) : [];
  for (const x of scheduleClose ? effects : own) {
    if (x.type === "release") {
      ensure(
        x.reason !== "no-show" && x.reason !== "timeout",
        `close is not a no-show (${x.reason})`,
      );
    }
  }

  // Cooldown model: every second counted release puts the identity on cooldown at t.
  for (const x of effects) {
    if (x.type !== "release" || !COUNTED.has(x.reason)) continue;
    const n = (shadow.counted.get(x.githubId) ?? 0) + 1;
    const id = after.identities[String(x.githubId)];
    if (n >= R.noShowsForCooldown) {
      ensure(id?.cooldownUntil === t + R.cooldownMs, "second counted release starts a cooldown");
      ensure(id?.noShows === 0, "the counter restarts after a cooldown");
      shadow.counted.set(x.githubId, 0);
    } else {
      ensure(id?.noShows === n, "a counted release is counted once");
      shadow.counted.set(x.githubId, n);
    }
  }
  // nextDeadline is exactly the earliest pending deadline (monotonic clocks only).
  if (monotonic) {
    const nd = nextDeadline(after);
    if (nd === null) {
      ensure(
        !isChange(after, step(after, { type: "tick" }, t + 10 * 86_400_000)),
        "nothing pending: ticks change nothing",
      );
    } else {
      ensure(nd > t, "every passed deadline was applied");
      const mid = t + Math.floor((nd - t) / 2);
      ensure(!isChange(after, step(after, { type: "tick" }, mid)), "no change before nextDeadline");
      ensure(
        !isChange(after, step(after, { type: "tick" }, nd - 1)),
        "no change just before nextDeadline",
      );
      ensure(isChange(after, step(after, { type: "tick" }, nd)), "a change at nextDeadline");
    }
  }
}

/** How often each effect (and release reason, and phase reached) occurred: the fuzz must reach them all. */
const seen = new Map<string, number>();
const MUST_SEE = [
  "grant",
  "dispatch",
  "accepted",
  "finalized",
  "release:finished",
  "release:no-show",
  "release:timeout",
  "release:banned",
  "release:closed",
  "release:infra",
  "state:OPEN",
  "state:PAUSED",
  "state:CLOSED",
];

function fuzz(seeds: [number, number], length: number, backwards: boolean) {
  let applied = 0;
  for (let seed = seeds[0]; seed <= seeds[1]; seed++) {
    const rand = mulberry32(seed);
    const closeAt = OPEN + (1 + pick(rand, 12)) * 3_600_000;
    const brisk = seed % 4 === 2 ? 0.995 : seed % 2 === 0 ? 0.9 : 0;
    const stall = seed % 4 === 2;
    let s = initialQueue({ openAt: OPEN, closeAt });
    let t = OPEN - pick(rand, 120_000);
    const shadow: Shadow = { counted: new Map(), maxActive: new Map() };
    for (let i = 0; i < length; i++) {
      t = nextTime(s, t, rand, backwards, brisk);
      const e = randomEvent(s, rand, stall);
      const r = run(s, e, t);
      try {
        checkStep(s, e, t, r, shadow, !backwards);
      } catch (error) {
        throw new Error(
          `seed ${seed} step ${i} t=${t} event=${JSON.stringify(e)}: ${(error as Error).message}\nstate=${snap(s)}`,
          { cause: error },
        );
      }
      if (r.ok) {
        s = r.state;
        applied++;
        for (const x of r.effects) {
          const k =
            x.type === "release"
              ? `release:${x.reason}`
              : x.type === "state"
                ? `state:${x.to}`
                : x.type;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return applied;
}

describe("queue invariants under adversarial clocks", () => {
  it(
    "monotonic clocks with duplicate times and exact deadline hits (400 × 400)",
    { timeout: 300_000 },
    () => {
      seen.clear();
      expect(fuzz([1, 400], 400, false)).toBeGreaterThan(15_000);
      expect(MUST_SEE.filter((k) => (seen.get(k) ?? 0) === 0)).toEqual([]);
    },
  );

  it("non-monotonic clocks keep every safety invariant (200 × 400)", { timeout: 300_000 }, () => {
    expect(fuzz([10_001, 10_200], 400, true)).toBeGreaterThan(8_000);
  });
});
