/** The queue state machine: states, timers, deadlines applied before every event. SPEC §4.2–4.3. */
import { describe, expect, it } from "vitest";
import {
  initialQueue,
  nextDeadline,
  type QueueEvent,
  type QueueState,
  step,
} from "../../../src/coordination/queue";
import { QUEUE_RULES } from "../../../src/config";

const S = 1000;
const MIN = 60 * S;
const OPEN = 1_000_000;
const CLOSE = OPEN + 24 * 60 * MIN;
const [ALICE, BOB, CAROL] = [1, 2, 3];

/** An open ceremony; `t` is the clock. */
function opened(): { s: QueueState; t: number } {
  const r = step(initialQueue({ openAt: OPEN, closeAt: CLOSE }), { type: "tick" }, OPEN);
  return { s: r.state, t: OPEN };
}

/** A `verified` event may omit `seq`/`attempt`: they default to the upload in flight. */
type TestEvent =
  | QueueEvent
  | {
      type: "verified";
      circuit: "shield" | "unshield" | "transfer";
      outcome: "valid" | "rejected" | "ambiguous" | "infra";
    };

function fill(s: QueueState, e: TestEvent): QueueEvent {
  if (e.type !== "verified" || "seq" in e) return e as QueueEvent;
  const entry = s.slot?.circuits.find((c) => c.circuit === e.circuit);
  return { ...e, seq: s.slot?.seq ?? 0, attempt: entry?.uploads ?? 0 };
}

/** Applies events in order; every one must be accepted. Returns the state and all effects. */
function run(s: QueueState, t: number, ...events: TestEvent[]) {
  const effects = [];
  for (const e of events) {
    const r = step(s, fill(s, e), t);
    if (!r.ok) throw new Error(`${e.type} refused: ${r.refusal}`);
    s = r.state;
    effects.push(...r.effects);
  }
  return { s, effects };
}

const refusal = (s: QueueState, e: TestEvent, t: number) => {
  const r = step(s, fill(s, e), t);
  return r.ok ? null : r.refusal;
};

/** ALICE holds a claimed slot at `t`. */
function claimed() {
  const { s, t } = opened();
  return {
    s: run(s, t, { type: "join", githubId: ALICE }, { type: "claim", githubId: ALICE }).s,
    t,
  };
}

/** ALICE claims a slot `before` ms ahead of the close; the alarm never fires after that. */
function claimedBeforeClose(before: number) {
  const { s } = opened();
  const t = CLOSE - before;
  return run(s, t, { type: "join", githubId: ALICE }, { type: "claim", githubId: ALICE }).s;
}

describe("a late alarm: every deadline applies before the event", () => {
  it("refuses an upload after the close, though the alarm left the phase OPEN", () => {
    const s = claimedBeforeClose(30 * S);
    expect(s.phase).toBe("OPEN");
    expect(refusal(s, { type: "uploaded", githubId: ALICE, circuit: "shield" }, CLOSE - 1)).toBe(
      null,
    );
    const late = step(s, { type: "uploaded", githubId: ALICE, circuit: "shield" }, CLOSE + 1);
    expect(late).toEqual({ ok: false, state: s, refusal: "not-open" });
  });

  it("refuses a join after the close", () => {
    const { s } = opened();
    expect(refusal(s, { type: "join", githubId: BOB }, CLOSE)).toBe("not-open");
  });

  it("refuses a claim after its claim window", () => {
    const { s, t } = opened();
    const granted = run(s, t, { type: "join", githubId: ALICE }).s;
    expect(refusal(granted, { type: "claim", githubId: ALICE }, t + 29 * S)).toBeNull();
    expect(refusal(granted, { type: "claim", githubId: ALICE }, t + 30 * S)).toBe("not-your-slot");
  });

  it("refuses a heartbeat after the missed-heartbeat deadline", () => {
    const { s, t } = claimed();
    expect(refusal(s, { type: "heartbeat", githubId: ALICE }, t + 89 * S)).toBeNull();
    expect(refusal(s, { type: "heartbeat", githubId: ALICE }, t + 90 * S)).toBe("not-your-slot");
  });

  it("refuses a result after the verify deadline (it ended as infra)", () => {
    const { s, t } = claimed();
    const up = run(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" }).s;
    const valid = { type: "verified", circuit: "shield", outcome: "valid" } as const;
    expect(refusal(up, valid, t + QUEUE_RULES.verifyDeadlineMs - 1)).toBeNull();
    expect(refusal(up, valid, t + QUEUE_RULES.verifyDeadlineMs)).toBe("no-verification");
  });
});

describe("ceremony states (SPEC §4.3)", () => {
  it("opens and closes on schedule, with a state record each time", () => {
    const s0 = initialQueue({ openAt: OPEN, closeAt: CLOSE });
    expect(step(s0, { type: "tick" }, OPEN - 1).state.phase).toBe("SCHEDULED");
    const open = step(s0, { type: "tick" }, OPEN);
    expect(open.state.phase).toBe("OPEN");
    expect(open.ok && open.effects).toEqual([
      { type: "state", from: "SCHEDULED", to: "OPEN", reason: "schedule" },
    ]);
    expect(step(open.state, { type: "tick" }, CLOSE).state.phase).toBe("CLOSED");
  });

  it("refuses joins before opening and invalid operator transitions", () => {
    const s0 = initialQueue({ openAt: OPEN, closeAt: CLOSE });
    expect(refusal(s0, { type: "join", githubId: ALICE }, OPEN - 1)).toBe("not-open");
    expect(refusal(s0, { type: "resume" }, OPEN)).toBe("invalid-transition");
    expect(refusal(opened().s, { type: "finalize" }, OPEN)).toBe("invalid-transition");
  });

  it("never mutates its input, and a refused event returns the same state", () => {
    const { s, t } = opened();
    const copy = structuredClone(s);
    step(s, { type: "join", githubId: ALICE }, t);
    expect(s).toEqual(copy);
    const r = step(s, { type: "claim", githubId: ALICE }, t);
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  });
});

describe("queue and slot (SPEC §4.1–4.2)", () => {
  it("grants the slot to the first in line, one at a time", () => {
    const { s, t } = opened();
    const r = run(s, t, { type: "join", githubId: ALICE }, { type: "join", githubId: BOB });
    expect(r.effects).toEqual([{ type: "grant", githubId: ALICE, seq: 1 }]);
    expect(r.s.slot?.githubId).toBe(ALICE);
    expect(r.s.queue.map((e) => e.githubId)).toEqual([BOB]);
    expect(refusal(r.s, { type: "join", githubId: BOB }, t)).toBe("already-queued");
  });

  it("puts invited contributors ahead of everyone not invited, in their own order", () => {
    const { s, t } = opened();
    const r = run(
      s,
      t,
      { type: "join", githubId: 10 },
      { type: "join", githubId: ALICE },
      { type: "join", githubId: BOB, invited: true },
      { type: "join", githubId: CAROL, invited: true },
    );
    expect(r.s.queue.map((e) => e.githubId)).toEqual([BOB, CAROL, ALICE]);
  });

  it("releases an unclaimed slot after 30 s as a no-show and moves on", () => {
    const { s, t } = opened();
    const q = run(s, t, { type: "join", githubId: ALICE }, { type: "join", githubId: BOB }).s;
    expect(step(q, { type: "tick" }, t + 29 * S).state.slot?.githubId).toBe(ALICE);
    const r = run(q, t + 30 * S, { type: "tick" });
    expect(r.effects).toEqual([
      { type: "release", githubId: ALICE, seq: 1, reason: "no-show" },
      { type: "grant", githubId: BOB, seq: 2 },
    ]);
    expect(r.s.identities[ALICE]?.noShows).toBe(1);
  });

  it("puts an identity in a 15-min cooldown after 2 no-shows", () => {
    let { s, t } = opened();
    for (let i = 0; i < 2; i++) {
      s = run(s, t, { type: "join", githubId: ALICE }).s;
      t += 30 * S;
      s = run(s, t, { type: "tick" }).s;
    }
    expect(refusal(s, { type: "join", githubId: ALICE }, t)).toBe("cooldown");
    expect(refusal(s, { type: "join", githubId: ALICE }, t + 15 * MIN)).toBeNull();
  });

  it("releases a claimed slot after 3 missed heartbeats (90 s)", () => {
    const { s, t } = claimed();
    const alive = run(s, t + 80 * S, { type: "heartbeat", githubId: ALICE }).s;
    expect(step(alive, { type: "tick" }, t + 160 * S).state.slot?.githubId).toBe(ALICE);
    const r = run(alive, t + 170 * S, { type: "tick" });
    expect(r.effects).toEqual([{ type: "release", githubId: ALICE, seq: 1, reason: "no-show" }]);
  });

  it("caps a session at 20 min of active time, with the clock frozen while verifying", () => {
    let { s, t } = claimed();
    for (let m = 1; m <= 18; m++) s = run(s, t + m * MIN, { type: "heartbeat", githubId: ALICE }).s;
    t += 18 * MIN;
    s = run(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" }).s;
    // 4 min of verification do not count.
    t += 4 * MIN;
    s = run(s, t, { type: "verified", circuit: "shield", outcome: "valid" }).s;
    expect(step(s, { type: "tick" }, t + 1 * MIN).state.slot?.githubId).toBe(ALICE);
    s = run(s, t + 1 * MIN, { type: "heartbeat", githubId: ALICE }).s;
    const r = run(s, t + 2 * MIN, { type: "tick" });
    expect(r.effects).toEqual([{ type: "release", githubId: ALICE, seq: 1, reason: "timeout" }]);
  });

  it("takes the circuits in order, one verification at a time", () => {
    const { s, t } = claimed();
    expect(refusal(s, { type: "uploaded", githubId: ALICE, circuit: "transfer" }, t)).toBe(
      "out-of-order",
    );
    const v = run(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" });
    expect(v.effects).toEqual([
      { type: "dispatch", githubId: ALICE, seq: 1, circuit: "shield", attempt: 1 },
    ]);
    expect(refusal(v.s, { type: "uploaded", githubId: ALICE, circuit: "unshield" }, t)).toBe(
      "busy",
    );
    expect(refusal(s, { type: "uploaded", githubId: BOB, circuit: "shield" }, t)).toBe(
      "not-your-slot",
    );
  });

  it("ends the session when every circuit is accepted and grants the next one", () => {
    let { s, t } = claimed();
    s = run(s, t, { type: "join", githubId: BOB }).s;
    const effects = [];
    for (const circuit of ["shield", "unshield", "transfer"] as const) {
      const r = run(
        s,
        t,
        { type: "uploaded", githubId: ALICE, circuit },
        { type: "verified", circuit, outcome: "valid" },
      );
      s = r.s;
      effects.push(...r.effects.filter((e) => e.type !== "dispatch"));
    }
    expect(effects).toEqual([
      { type: "accepted", githubId: ALICE, seq: 1, circuit: "shield" },
      { type: "accepted", githubId: ALICE, seq: 1, circuit: "unshield" },
      { type: "accepted", githubId: ALICE, seq: 1, circuit: "transfer" },
      { type: "release", githubId: ALICE, seq: 1, reason: "finished" },
      { type: "grant", githubId: BOB, seq: 2 },
    ]);
    expect(refusal(s, { type: "join", githubId: ALICE }, t)).toBe("nothing-left");
  });

  it("offers only the missing circuits in a later session", () => {
    let { s, t } = claimed();
    s = run(
      s,
      t,
      { type: "uploaded", githubId: ALICE, circuit: "shield" },
      { type: "verified", circuit: "shield", outcome: "valid" },
      { type: "finish", githubId: ALICE },
      { type: "join", githubId: ALICE },
    ).s;
    expect(s.slot?.circuits.map((c) => c.circuit)).toEqual(["unshield", "transfer"]);
  });
});

/** ALICE uploads her first circuit. */
const upload = (s: QueueState, t: number) =>
  run(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" }).s;

describe("verification outcomes (SPEC §2.5 contract)", () => {
  it("allows one retry after `rejected`, then skips the circuit", () => {
    const { s, t } = claimed();
    const once = run(upload(s, t), t, {
      type: "verified",
      circuit: "shield",
      outcome: "rejected",
    }).s;
    expect(once.slot?.circuits[0]?.status).toBe("todo");
    const twice = run(upload(once, t), t, {
      type: "verified",
      circuit: "shield",
      outcome: "rejected",
    }).s;
    expect(twice.slot?.circuits[0]?.status).toBe("skipped");
    expect(twice.slot?.circuits[1]?.status).toBe("todo");
  });

  it("bans an identity after 3 `rejected` across sessions", () => {
    let { s, t } = claimed();
    s = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "rejected" }).s;
    s = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "rejected" }).s;
    s = run(
      s,
      t,
      { type: "finish", githubId: ALICE },
      { type: "join", githubId: ALICE },
      { type: "claim", githubId: ALICE },
    ).s;
    const r = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "rejected" });
    expect(r.effects).toContainEqual({
      type: "release",
      githubId: ALICE,
      seq: 2,
      reason: "banned",
    });
    expect(refusal(r.s, { type: "join", githubId: ALICE }, t)).toBe("banned");
  });

  it("gives the attempt back on `ambiguous`, but only up to the session's infra bound", () => {
    let { s, t } = claimed();
    s = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "ambiguous" }).s;
    // The attempt is given back, and the upload keeps its own id.
    expect(s.slot?.circuits[0]).toEqual({
      circuit: "shield",
      status: "todo",
      attempts: 0,
      uploads: 1,
      infra: 1,
    });
    // The second ends the session, as a second infra would: no endless free re-uploads.
    const r = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "ambiguous" });
    expect(r.s.slot).toBeNull();
  });

  it("pauses on `infra` with the slot frozen, without penalizing, and resumes", () => {
    let { s, t } = claimed();
    s = run(upload(s, t), t, { type: "verified", circuit: "shield", outcome: "infra" }).s;
    expect([s.phase, s.pausedBy]).toEqual(["PAUSED", "verifier"]);
    expect(s.slot?.runningSince).toBeNull();
    // Hours later, still paused: nothing expires.
    expect(step(s, { type: "tick" }, t + 3 * 60 * MIN).state.slot?.githubId).toBe(ALICE);
    s = run(s, t + 3 * 60 * MIN, { type: "resume" }).s;
    expect(s.phase).toBe("OPEN");
    expect(s.slot?.circuits[0]).toEqual({
      circuit: "shield",
      status: "todo",
      attempts: 0,
      uploads: 1,
      infra: 1,
    });
    expect(s.identities[ALICE]?.rejected).toBe(0);
  });

  it("treats a verifier that misses its 5-min deadline as `infra`", () => {
    const { s, t } = claimed();
    const r = run(upload(s, t), t + QUEUE_RULES.verifyDeadlineMs, { type: "tick" });
    expect(r.s.phase).toBe("PAUSED");
    expect(r.effects).toEqual([
      { type: "state", from: "OPEN", to: "PAUSED", reason: "verifier unavailable" },
    ]);
  });

  it("ignores a result for a circuit not in flight (duplicate callbacks)", () => {
    const { s, t } = claimed();
    expect(refusal(s, { type: "verified", circuit: "shield", outcome: "valid" }, t)).toBe(
      "no-verification",
    );
  });
});

describe("the last valid state is kept (a timeout never advances the ceremony)", () => {
  it("drops a `valid` that arrives after the verify deadline: the circuit stays to do", () => {
    const { s, t } = claimed();
    const late = run(upload(s, t), t + QUEUE_RULES.verifyDeadlineMs, { type: "tick" }).s;
    const r = step(
      late,
      fill(late, { type: "verified", circuit: "shield", outcome: "valid" }),
      t + 6 * MIN,
    );
    expect(r.ok).toBe(false);
    expect(late.slot?.circuits[0]?.status).toBe("todo");
    expect(late.identities[ALICE]?.accepted).toEqual([]);
  });

  it("never emits `accepted` from a timeout, whatever expires", () => {
    const { s, t } = claimed();
    const verifying = upload(s, t);
    const effects = [
      ...run(verifying, t + 10 * 60 * MIN, { type: "tick" }).effects,
      ...run(s, t + 10 * 60 * MIN, { type: "tick" }).effects,
      ...run(opened().s, OPEN, { type: "join", githubId: BOB }).effects,
    ];
    expect(effects.some((e) => e.type === "accepted")).toBe(false);
  });
});

describe("pause, close and the alarm", () => {
  it("gives a fresh claim window after a pause", () => {
    const { s, t } = opened();
    let q = run(s, t, { type: "join", githubId: ALICE }, { type: "pause" }).s;
    expect(step(q, { type: "tick" }, t + 10 * MIN).state.slot?.githubId).toBe(ALICE);
    q = run(q, t + 10 * MIN, { type: "resume" }).s;
    expect(step(q, { type: "tick" }, t + 10 * MIN + 29 * S).state.slot?.githubId).toBe(ALICE);
  });

  it("lets an in-flight verification finish after closing, then releases the slot", () => {
    let { s, t } = claimed();
    s = run(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" }, { type: "close" }).s;
    expect([s.phase, s.slot?.githubId]).toEqual(["CLOSED", ALICE]);
    expect(refusal(s, { type: "finalize" }, t)).toBe("invalid-transition");
    const r = run(
      s,
      t,
      { type: "verified", circuit: "shield", outcome: "valid" },
      { type: "finalize" },
    );
    expect(r.effects.map((e) => e.type)).toEqual(["accepted", "release", "finalized"]);
    expect(r.s.phase).toBe("FINALIZED");
  });

  it("schedules the alarm at the earliest pending deadline, and none once finalized", () => {
    const s0 = initialQueue({ openAt: OPEN, closeAt: CLOSE });
    expect(nextDeadline(s0)).toBe(OPEN);
    const { s, t } = opened();
    const granted = run(s, t, { type: "join", githubId: ALICE }).s;
    expect(nextDeadline(granted)).toBe(t + QUEUE_RULES.claimWindowMs);
    const running = run(granted, t + 5 * S, { type: "claim", githubId: ALICE }).s;
    expect(nextDeadline(running)).toBe(t + 5 * S + 90 * S);
    const verifying = run(running, t + 6 * S, {
      type: "uploaded",
      githubId: ALICE,
      circuit: "shield",
    }).s;
    expect(nextDeadline(verifying)).toBe(t + 6 * S + QUEUE_RULES.verifyDeadlineMs);
    const done = run(
      running,
      t + 7 * S,
      { type: "finish", githubId: ALICE },
      { type: "close" },
      { type: "finalize" },
    ).s;
    expect(nextDeadline(done)).toBeNull();
  });

  it("is idempotent under a duplicated alarm", () => {
    const { s, t } = claimed();
    const once = step(s, { type: "tick" }, t + 100 * S);
    const twice = step(once.state, { type: "tick" }, t + 100 * S);
    expect(twice.ok && twice.effects).toEqual([]);
    expect(twice.state).toEqual(once.state);
  });
});
