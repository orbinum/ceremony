/**
 * Attacks on the queue's own rules: how far one contributor can stall the slot or pause the
 * ceremony (SPEC §4.2, KL-30), plus clock edge cases.
 */
import { describe, expect, it } from "vitest";
import { QUEUE_RULES } from "../../../src/config";
import {
  initialQueue,
  type QueueEffect,
  type QueueEvent,
  type QueueState,
  step,
} from "../../../src/coordination/queue";

const MIN = 60_000;
const OPEN = 1_000_000;
const CLOSE = OPEN + 7 * 24 * 60 * MIN;
const EVE = 7;

function apply(
  s: QueueState,
  t: number,
  ...events: QueueEvent[]
): { s: QueueState; fx: QueueEffect[] } {
  const fx: QueueEffect[] = [];
  for (const e of events) {
    const r = step(s, e, t);
    if (!r.ok) throw new Error(`${e.type} refused: ${r.refusal}`);
    s = r.state;
    fx.push(...r.effects);
  }
  return { s, fx };
}
const opened = () =>
  step(initialQueue({ openAt: OPEN, closeAt: CLOSE }), { type: "tick" }, OPEN).state;
const inFlight = (s: QueueState) => s.slot?.circuits.find((c) => c.status === "verifying");
const result = (s: QueueState, outcome: "valid" | "rejected" | "infra"): QueueEvent => {
  const c = inFlight(s);
  if (!s.slot || !c) throw new Error("nothing in flight");
  return { type: "verified", seq: s.slot.seq, circuit: c.circuit, attempt: c.uploads, outcome };
};
const nextTodo = (s: QueueState) =>
  s.slot?.circuits.find((c) => c.status === "todo")?.circuit ?? "shield";
const pauses = (fx: QueueEffect[]) =>
  fx.filter((x) => x.type === "state" && x.to === "PAUSED" && x.reason === "verifier unavailable")
    .length;

describe("contributor-driven pauses (SPEC §4.2, KL-30)", () => {
  // The infra counter spans the session, not one circuit: rejections or accepted circuits in
  // between must not reset it.
  it("bounds verifier pauses to two per session, across circuits", () => {
    let t = OPEN;
    let { s, fx } = apply(
      opened(),
      t,
      { type: "join", githubId: EVE },
      { type: "claim", githubId: EVE },
    );
    const all: QueueEffect[] = [...fx];
    const upload = () => ({ type: "uploaded", githubId: EVE, circuit: nextTodo(s) }) as QueueEvent;
    const run = (...outcomes: ("valid" | "rejected" | "infra")[]) => {
      for (const o of outcomes) {
        t += 1000;
        ({ s, fx } = apply(s, t, upload()));
        all.push(...fx);
        ({ s, fx } = apply(s, t, result(s, o)));
        all.push(...fx);
        if (s.phase === "PAUSED") {
          ({ s, fx } = apply(s, t, { type: "resume" }));
          all.push(...fx);
        }
      }
    };
    // shield: infra (pause 1), rejected, rejected → skipped; unshield: infra (pause 2) → released.
    run("infra", "rejected", "rejected", "infra");
    const released = all.filter((x) => x.type === "release");
    expect(released).toEqual([{ type: "release", githubId: EVE, seq: 1, reason: "infra" }]);
    expect(s.identities[String(EVE)]).toMatchObject({ banned: false, rejected: 2 });
    expect(pauses(all)).toBeLessThanOrEqual(2);
  });

  // KL-30: across sessions, cooldowns space the pauses, and repeated infra releases hold the
  // identity until the operator lifts it.
  it("holds an identity after repeated infra releases until the operator lifts it", () => {
    let t = OPEN;
    let s = opened();
    let total = 0;
    let sessions = 0;
    const refusals: string[] = [];
    // Every session uploads twice and both end as infra, until the queue refuses for good.
    while (sessions < 10) {
      const joined = step(s, { type: "join", githubId: EVE }, t);
      if (!joined.ok) {
        refusals.push(joined.refusal);
        if (joined.refusal === "held") break;
        t = (s.identities[String(EVE)]?.cooldownUntil ?? t) + 1;
        continue;
      }
      sessions++;
      let r = apply(joined.state, t, { type: "claim", githubId: EVE });
      for (let i = 0; i < 2; i++) {
        r = apply(r.s, t, { type: "uploaded", githubId: EVE, circuit: "shield" });
        r = apply(r.s, t, result(r.s, "infra"));
        total += pauses(r.fx);
        r = apply(r.s, t, { type: "resume" });
      }
      s = r.s;
      t += 1000;
    }
    expect(sessions).toBe(QUEUE_RULES.maxInfraResults / QUEUE_RULES.infraPerSession);
    expect(total).toBe(QUEUE_RULES.maxInfraResults);
    expect(refusals.at(-1)).toBe("held");
    expect(s.identities[String(EVE)]).toMatchObject({ held: true, banned: false, rejected: 0 });

    // Lifting needs a hold; afterwards the identity may queue again once its cooldown is over.
    expect(step(s, { type: "unhold", githubId: EVE + 1 }, t)).toMatchObject({
      ok: false,
      refusal: "invalid-transition",
    });
    s = apply(s, t, { type: "unhold", githubId: EVE }).s;
    expect(s.identities[String(EVE)]).toMatchObject({ held: false, infraResults: 0 });
    t = Math.max(t, (s.identities[String(EVE)]?.cooldownUntil ?? t) + 1);
    expect(step(s, { type: "join", githubId: EVE }, t).ok).toBe(true);
  });

  // Ending the session itself after each infra (finish) instead of waiting for the release.
  it("holds an identity that finishes its session after every infra", () => {
    let t = OPEN;
    let s = opened();
    let total = 0;
    let refusal = "";
    for (let i = 0; i < 20; i++) {
      const joined = step(s, { type: "join", githubId: EVE }, t);
      if (!joined.ok) {
        refusal = joined.refusal;
        break;
      }
      let r = apply(joined.state, t, { type: "claim", githubId: EVE });
      r = apply(r.s, t, { type: "uploaded", githubId: EVE, circuit: "shield" });
      r = apply(r.s, t, result(r.s, "infra"));
      total += pauses(r.fx);
      r = apply(r.s, t, { type: "resume" });
      if (r.s.slot?.githubId === EVE) r = apply(r.s, t, { type: "finish", githubId: EVE });
      s = r.s;
      t += 1000;
    }
    expect(refusal).toBe("held");
    expect(total).toBe(QUEUE_RULES.maxInfraResults);
  });

  it("lets a holder that finishes within its turn leave without penalty and queue again", () => {
    let t = OPEN;
    let { s } = apply(
      opened(),
      t,
      { type: "join", githubId: EVE },
      { type: "claim", githubId: EVE },
    );
    for (let i = 0; i < 39; i++) {
      t += 30_000;
      ({ s } = apply(s, t, { type: "heartbeat", githubId: EVE }));
    }
    const { s: after, fx } = apply(s, t, { type: "finish", githubId: EVE });
    expect(fx).toEqual([{ type: "release", githubId: EVE, seq: 1, reason: "finished" }]);
    expect(after.identities[String(EVE)]).toMatchObject({ noShows: 0, cooldownUntil: 0 });
    expect(step(after, { type: "join", githubId: EVE }, t).ok).toBe(true);
  });
});

describe("clock edge cases", () => {
  // A second infra (the verify deadline) after T_close releases the session as closed: closing
  // never counts as a no-show.
  it("releases a session whose verify deadline passes after T_close as closed", () => {
    const close = OPEN + MIN;
    let s = step(initialQueue({ openAt: OPEN, closeAt: close }), { type: "tick" }, OPEN).state;
    s = apply(s, OPEN, { type: "join", githubId: EVE }, { type: "claim", githubId: EVE }).s;
    s = apply(s, OPEN, { type: "uploaded", githubId: EVE, circuit: "shield" }).s;
    s = apply(s, OPEN, result(s, "infra"), { type: "resume" }).s;
    const t = OPEN + 30_000;
    s = apply(s, t, { type: "uploaded", githubId: EVE, circuit: "shield" }).s;
    const late = step(s, { type: "tick" }, t + QUEUE_RULES.verifyDeadlineMs);
    if (!late.ok) throw new Error("tick refused");
    expect(late.state.phase).toBe("CLOSED");
    expect(late.effects.filter((x) => x.type === "release")).toEqual([
      { type: "release", githubId: EVE, seq: 1, reason: "closed" },
    ]);
    expect(late.state.identities[String(EVE)]?.noShows ?? 0).toBe(0);
  });

  // The Durable Object settles a valid result at its receipt time, after the promotion copy. If
  // the copy outlasts the 60 s clock hold, events in between were applied at real time; the late
  // settle must not rewind the heartbeat window.
  it("never penalizes a contributor for a slow promotion copy", () => {
    let s = apply(
      opened(),
      OPEN,
      { type: "join", githubId: EVE },
      { type: "claim", githubId: EVE },
    ).s;
    s = apply(s, OPEN, { type: "uploaded", githubId: EVE, circuit: "shield" }).s;
    const at = OPEN + 30_000; // the valid result is received; its copy then takes 70 s
    s = apply(s, at + 65_000, { type: "heartbeat", githubId: EVE }).s; // after the hold ended
    s = apply(s, at, result(s, "valid")).s; // settled at receipt, once the copy is done
    // The heartbeat applied during the copy is kept: the late settle never rewinds it.
    expect(s.slot?.lastHeartbeat).toBe(at + 65_000);
    const r = step(s, { type: "heartbeat", githubId: EVE }, at + 95_000);
    expect(r.ok ? "kept" : r.refusal).toBe("kept");
  });

  it("never subtracts active time when the clock runs backwards", () => {
    let s = apply(
      opened(),
      OPEN,
      { type: "join", githubId: EVE },
      { type: "claim", githubId: EVE },
    ).s;
    s = apply(s, OPEN + 10_000, { type: "heartbeat", githubId: EVE }).s;
    s = apply(s, OPEN - 60_000, { type: "pause" }).s;
    expect(s.slot?.activeMs).toBe(0);
  });
});
