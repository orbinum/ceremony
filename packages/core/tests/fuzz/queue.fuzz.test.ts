/** The queue machine under random event sequences keeps its invariants. SPEC §4.1–4.3. */
import { describe, expect, it } from "vitest";
import {
  initialQueue,
  nextDeadline,
  type QueueEvent,
  type QueueState,
  step,
} from "../../src/coordination/queue";
import { ensure, mulberry32, pick, CIRCUIT_NAMES } from "../support";

const OPEN = 1_000_000;
const CLOSE = OPEN + 3 * 3600_000;
const IDS = [1, 2, 3, 4];
const OUTCOMES = ["valid", "rejected", "ambiguous", "infra"] as const;

function randomEvent(s: QueueState, rand: () => number): QueueEvent {
  const githubId = IDS[pick(rand, IDS.length)] as number;
  const slot = s.slot;
  switch (pick(rand, 11)) {
    case 0:
      return { type: "join", githubId, invited: rand() < 0.2 };
    case 1:
      return { type: "leave", githubId };
    case 2:
      return { type: "claim", githubId: rand() < 0.8 && slot ? slot.githubId : githubId };
    case 3:
      return { type: "heartbeat", githubId: slot?.githubId ?? githubId };
    case 4: {
      const next = slot?.circuits.find((c) => c.status === "todo");
      return {
        type: "uploaded",
        githubId: slot?.githubId ?? githubId,
        circuit: next?.circuit ?? "shield",
      };
    }
    case 5: {
      const v = slot?.circuits.find((c) => c.status === "verifying");
      return {
        type: "verified",
        seq: slot?.seq ?? 0,
        circuit: v?.circuit ?? (CIRCUIT_NAMES[pick(rand, 3)] as "shield"),
        attempt: rand() < 0.9 ? (v?.uploads ?? 1) : pick(rand, 4),
        outcome: OUTCOMES[pick(rand, 4)] as "valid",
      };
    }
    case 6:
      return { type: "finish", githubId: slot?.githubId ?? githubId };
    case 7:
      return { type: rand() < 0.5 ? "pause" : "resume" };
    case 8:
      return { type: rand() < 0.97 ? "tick" : "close" };
    case 9:
      return { type: "finalize" };
    default:
      return { type: "tick" };
  }
}

function invariants(s: QueueState): void {
  const slot = s.slot;
  if (slot) {
    ensure(!s.queue.some((q) => q.githubId === slot.githubId), "the holder is not also queued");
    const inFlight = slot.circuits.filter((c) => c.status === "verifying").length;
    ensure(inFlight <= 1, "at most one verification in flight");
    ensure(
      (slot.verifyDeadline !== null) === (inFlight === 1),
      "a verify deadline exactly while verifying",
    );
    for (const c of slot.circuits) {
      ensure(c.attempts >= 0 && c.uploads >= c.attempts, "attempt counters stay consistent");
    }
  }
  ensure(new Set(s.queue.map((q) => q.githubId)).size === s.queue.length, "one place per identity");
  for (const id of Object.values(s.identities)) {
    ensure(
      new Set(id.accepted).size === id.accepted.length,
      "a circuit is accepted once per identity",
    );
  }
}

describe("fuzz: the queue machine under random event sequences", () => {
  it("keeps its invariants across 300 sequences of 200 events", { timeout: 60_000 }, () => {
    let applied = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      let s = step(
        initialQueue({ openAt: OPEN, closeAt: CLOSE }, CIRCUIT_NAMES),
        { type: "tick" },
        OPEN,
      ).state;
      let t = OPEN;
      let lastSeq = 0;
      const dispatched = new Set<string>();
      for (let i = 0; i < 200; i++) {
        t += pick(rand, 120_000);
        const e = randomEvent(s, rand);
        const r = step(s, e, t);
        if (!r.ok) {
          ensure(r.state === s, "a refused event returns the same state object");
          continue;
        }
        for (const effect of r.effects) {
          if (effect.type === "grant") {
            ensure(effect.seq > lastSeq, "session numbers increase");
            lastSeq = effect.seq;
          }
          if (effect.type === "dispatch") {
            ensure(t < CLOSE, "no upload is accepted at or after the close");
            dispatched.add(`${effect.seq}/${effect.circuit}`);
          }
          if (effect.type === "accepted") {
            ensure(
              dispatched.has(`${effect.seq}/${effect.circuit}`),
              "accepted only after a dispatch",
            );
            ensure(
              e.type === "verified" && e.outcome === "valid",
              "accepted only on a valid result",
            );
          }
        }
        ensure(s.phase !== "FINALIZED" || r.state.phase === "FINALIZED", "FINALIZED is final");
        s = r.state;
        applied += 1;
        invariants(s);
        // A tick at the next deadline is idempotent once applied.
        const at = nextDeadline(s);
        if (at !== null && at <= t) {
          const again = step(s, { type: "tick" }, t);
          const twice = step(again.state, { type: "tick" }, t).state;
          ensure(JSON.stringify(twice) === JSON.stringify(again.state), "tick is idempotent");
        }
      }
    }
    expect(applied).toBeGreaterThan(10_000);
  });
});
