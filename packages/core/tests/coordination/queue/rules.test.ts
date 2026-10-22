/** The queue's skip, ban, infra and view rules. SPEC §4.2. */
import { describe, expect, it } from "vitest";
import {
  initialQueue,
  isCurrentVerification,
  nextDeadline,
  type QueueEvent,
  type QueueState,
  slotView,
  step,
} from "../../../src/coordination/queue";
import { QUEUE_RULES } from "../../../src/config";

const MIN = 60_000;
const OPEN = 1_000_000;
const CLOSE = OPEN + 24 * 60 * MIN;
const [ALICE, BOB] = [1, 2];

function apply(s: QueueState, t: number, ...events: QueueEvent[]): QueueState {
  for (const e of events) {
    const r = step(s, e, t);
    if (!r.ok) throw new Error(`${e.type} refused: ${r.refusal}`);
    s = r.state;
  }
  return s;
}
const refused = (s: QueueState, e: QueueEvent, t: number) => {
  const r = step(s, e, t);
  return r.ok ? null : r.refusal;
};
const opened = () =>
  step(initialQueue({ openAt: OPEN, closeAt: CLOSE }), { type: "tick" }, OPEN).state;
const holding = (t = OPEN) =>
  apply(opened(), t, { type: "join", githubId: ALICE }, { type: "claim", githubId: ALICE });
const uploading = (t = OPEN) =>
  apply(holding(t), t, { type: "uploaded", githubId: ALICE, circuit: "shield" });
const result = (
  s: QueueState,
  outcome: "valid" | "rejected" | "ambiguous" | "infra",
  attempt?: number,
): QueueEvent => ({
  type: "verified",
  seq: s.slot?.seq ?? 0,
  circuit: "shield",
  attempt: attempt ?? s.slot?.circuits[0]?.uploads ?? 0,
  outcome,
});

/** One session whose shield upload hits `infra` twice, from state `s` at time `t`. */
const twoInfra = (s: QueueState, t: number) => {
  s = apply(s, t, { type: "uploaded", githubId: ALICE, circuit: "shield" });
  s = apply(
    s,
    t,
    result(s, "infra"),
    { type: "resume" },
    { type: "uploaded", githubId: ALICE, circuit: "shield" },
  );
  const r = step(s, result(s, "infra"), t);
  if (!r.ok) throw new Error(r.refusal);
  return r;
};

describe("input guards", () => {
  it("refuses a githubId that is not a positive safe integer (no prototype keys)", () => {
    for (const githubId of [0, -1, 1.5, Number.NaN, "__proto__" as unknown as number]) {
      expect(refused(opened(), { type: "join", githubId }, OPEN)).toBe("malformed");
    }
    expect(Object.getPrototypeOf({}).noShows).toBeUndefined();
  });

  it("applies a result only to the upload in flight: same session, circuit and upload id", () => {
    const s = uploading();
    expect(refused(s, { ...result(s, "valid"), seq: 99 } as QueueEvent, OPEN)).toBe(
      "no-verification",
    );
    expect(refused(s, result(s, "valid", 2), OPEN)).toBe("no-verification");
    expect(refused(s, { ...result(s, "valid"), circuit: "transfer" } as QueueEvent, OPEN)).toBe(
      "no-verification",
    );
    expect(isCurrentVerification(s, { seq: 1, circuit: "shield", attempt: 1 })).toBe(true);
    expect(isCurrentVerification(s, { seq: 1, circuit: "shield", attempt: 2 })).toBe(false);
    expect(isCurrentVerification(s, { seq: 2, circuit: "shield", attempt: 1 })).toBe(false);
    expect(isCurrentVerification(s, { seq: 1, circuit: "unshield", attempt: 1 })).toBe(false);
  });

  it("never lets a late result of an earlier upload apply to a re-upload", () => {
    let s = uploading();
    s = apply(s, OPEN, result(s, "ambiguous"));
    s = apply(s, OPEN, { type: "uploaded", githubId: ALICE, circuit: "shield" });
    expect(s.slot?.circuits[0]).toMatchObject({ attempts: 1, uploads: 2 });
    expect(refused(s, result(s, "valid", 1), OPEN)).toBe("no-verification");
    expect(apply(s, OPEN, result(s, "valid", 2)).identities[ALICE]?.accepted).toEqual(["shield"]);
  });
});

describe("repeated infra (SPEC §4.2)", () => {
  it("pauses on the first, and releases the session on the second, counted like a no-show", () => {
    const r = twoInfra(holding(), OPEN);
    expect(r.effects).toContainEqual({ type: "release", githubId: ALICE, seq: 1, reason: "infra" });
    expect(r.state.slot).toBeNull();
    // Not a rejection, not a ban: one no-show towards the cooldown.
    expect(r.state.identities[ALICE]).toMatchObject({
      noShows: 1,
      rejected: 0,
      banned: false,
      cooldownUntil: 0,
    });
    expect(
      refused(apply(r.state, OPEN, { type: "resume" }), { type: "join", githubId: ALICE }, OPEN),
    ).toBeNull();
  });

  it("puts an identity whose uploads keep stalling the verifier on cooldown", () => {
    const first = twoInfra(holding(), OPEN);
    const t = OPEN + MIN;
    let s = apply(first.state, t, { type: "resume" }, { type: "join", githubId: ALICE });
    s = apply(s, t, { type: "claim", githubId: ALICE });
    const second = twoInfra(s, t);
    expect(second.state.identities[ALICE]).toMatchObject({
      noShows: 0,
      rejected: 0,
      banned: false,
      cooldownUntil: t + QUEUE_RULES.cooldownMs,
    });
    const resumed = apply(second.state, t, { type: "resume" });
    expect(refused(resumed, { type: "join", githubId: ALICE }, t)).toBe("cooldown");
    expect(
      refused(resumed, { type: "join", githubId: ALICE }, t + QUEUE_RULES.cooldownMs),
    ).toBeNull();
  });

  it("counts a missed verify deadline as infra too", () => {
    let s = uploading();
    s = step(s, { type: "tick" }, OPEN + QUEUE_RULES.verifyDeadlineMs).state;
    expect(s.slot?.circuits[0]?.infra).toBe(1);
  });
});

describe("leaving, finishing and closing", () => {
  it("refuses to leave or finish while a verification is in flight", () => {
    const s = uploading();
    expect(refused(s, { type: "leave", githubId: ALICE }, OPEN)).toBe("busy");
    expect(refused(s, { type: "finish", githubId: ALICE }, OPEN)).toBe("busy");
  });

  it("lets the holder leave (the next one is granted) and a queued identity drop out", () => {
    let s = apply(holding(), OPEN, { type: "join", githubId: BOB });
    s = apply(s, OPEN, { type: "leave", githubId: ALICE });
    expect(s.slot?.githubId).toBe(BOB);
    s = apply(
      opened(),
      OPEN,
      { type: "join", githubId: ALICE },
      { type: "join", githubId: BOB },
      { type: "leave", githubId: BOB },
    );
    expect(s.queue).toEqual([]);
  });

  it("refuses holder moves out of turn", () => {
    const s = apply(opened(), OPEN, { type: "join", githubId: ALICE });
    expect(refused(s, { type: "heartbeat", githubId: ALICE }, OPEN)).toBe("not-claimed");
    expect(refused(s, { type: "uploaded", githubId: ALICE, circuit: "shield" }, OPEN)).toBe(
      "not-claimed",
    );
    const c = apply(s, OPEN, { type: "claim", githubId: ALICE });
    expect(refused(c, { type: "claim", githubId: ALICE }, OPEN)).toBe("already-claimed");
    expect(
      refused(
        apply(c, OPEN, { type: "pause" }),
        { type: "uploaded", githubId: ALICE, circuit: "shield" },
        OPEN,
      ),
    ).toBe("not-open");
  });

  it("closes a session without penalty, even if its heartbeats lapsed at the same time", () => {
    const s = holding(CLOSE - MIN);
    const r = step(s, { type: "tick" }, CLOSE + 10 * MIN);
    expect(r.ok && r.effects).toContainEqual({
      type: "release",
      githubId: ALICE,
      seq: 1,
      reason: "closed",
    });
    expect(r.state.identities[ALICE]?.noShows).toBe(0);
  });

  it("lets a verification in flight at close end as infra by its deadline, then releases as closed", () => {
    const s = apply(uploading(CLOSE - MIN), CLOSE, { type: "tick" });
    expect(s.phase).toBe("CLOSED");
    const r = step(s, { type: "tick" }, CLOSE - MIN + QUEUE_RULES.verifyDeadlineMs);
    expect(r.ok && r.effects.map((e) => e.type)).toEqual(["release"]);
    expect(r.state.phase).toBe("CLOSED");
  });

  it("refuses everything but ticks after FINALIZED, and finalizes with people still queued", () => {
    let s = apply(
      opened(),
      OPEN,
      { type: "join", githubId: ALICE },
      { type: "join", githubId: BOB },
    );
    s = apply(s, OPEN, { type: "close" });
    s = apply(s, OPEN, { type: "finalize" });
    expect(s.phase).toBe("FINALIZED");
    for (const e of [
      { type: "join", githubId: 3 },
      { type: "leave", githubId: ALICE },
      { type: "claim", githubId: ALICE },
      { type: "heartbeat", githubId: ALICE },
      { type: "uploaded", githubId: ALICE, circuit: "shield" },
      { type: "verified", seq: 1, circuit: "shield", attempt: 1, outcome: "valid" },
      { type: "finish", githubId: ALICE },
      { type: "pause" },
      { type: "resume" },
      { type: "close" },
      { type: "finalize" },
    ] as const) {
      expect(refused(s, e, OPEN)).toBe("finalized");
    }
    expect(step(s, { type: "tick" }, CLOSE + MIN)).toEqual({ ok: true, state: s, effects: [] });
  });
});

describe("operator transitions", () => {
  it("refuses a pause after the close (a closed ceremony never reopens)", () => {
    const closed = apply(holding(), OPEN, { type: "close" });
    expect(refused(closed, { type: "pause" }, OPEN)).toBe("invalid-transition");
    expect(refused(closed, { type: "resume" }, OPEN)).toBe("invalid-transition");
  });
});

describe("deadlines and views", () => {
  it("waits only for the close while paused with an idle slot", () => {
    const s = apply(holding(), OPEN, { type: "pause" });
    expect(nextDeadline(s)).toBe(CLOSE);
  });

  it("puts the active cap first once heartbeats are fresh", () => {
    let s = holding();
    for (let t = OPEN + MIN; t < OPEN + QUEUE_RULES.activeCapMs; t += MIN) {
      s = apply(s, t, { type: "heartbeat", githubId: ALICE });
    }
    s = apply(s, OPEN + QUEUE_RULES.activeCapMs - 10_000, { type: "heartbeat", githubId: ALICE });
    expect(nextDeadline(s)).toBe(OPEN + QUEUE_RULES.activeCapMs);
  });

  it("shows a contributor their own place only", () => {
    const s = apply(holding(), OPEN, { type: "join", githubId: BOB });
    expect(slotView(s, BOB)).toEqual({ phase: "OPEN", position: 1, slot: null });
    expect(slotView(s, ALICE).slot).toMatchObject({ seq: 1, claimed: true, claimBy: null });
  });
});
