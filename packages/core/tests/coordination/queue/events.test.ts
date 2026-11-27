/** Who may send which queue event, attestations ending sessions, and the records of effects. */
import { describe, expect, it } from "vitest";
import {
  attestStep,
  headView,
  clientEventRefusal,
  initialQueue,
  OPERATOR_ACTIONS,
  publicStatusOf,
  type QueueState,
  recordsOfEffects,
  step,
} from "../../../src/coordination/queue";
import { buildBeaconRecord } from "../../../src/ceremony/transcript";
import { DRAND } from "../../../src/config";
import { contribution, ID, R1000, CIRCUIT_NAMES } from "../../support";

const OPEN = 1_000_000;
const opened = (): QueueState =>
  step(
    initialQueue({ openAt: OPEN, closeAt: OPEN + 3_600_000 }, CIRCUIT_NAMES),
    { type: "tick" },
    OPEN,
  ).state;
function holding(githubId: number): QueueState {
  let s = opened();
  for (const e of [
    { type: "join", githubId },
    { type: "claim", githubId },
  ] as const) {
    const r = step(s, e, OPEN);
    if (!r.ok) throw new Error(r.refusal);
    s = r.state;
  }
  return s;
}

const NEVER = Number.MAX_SAFE_INTEGER;

describe("who may send which event", () => {
  it("keeps uploads, results and finalization to their own checked paths", () => {
    expect(clientEventRefusal({ type: "join", githubId: 1 }, true)).toBeNull();
    expect(clientEventRefusal({ type: "claim", githubId: 1 }, false)).toBeNull();
    expect(clientEventRefusal({ type: "pause" }, false)).toBeNull();
    expect(clientEventRefusal({ type: "uploaded", githubId: 1, circuit: "shield" }, true)).toBe(
      "invalid-transition",
    );
    expect(
      clientEventRefusal(
        { type: "verified", seq: 1, circuit: "shield", attempt: 1, outcome: "valid" },
        true,
      ),
    ).toBe("invalid-transition");
    expect(clientEventRefusal({ type: "finalize" }, true)).toBe("invalid-transition");
    expect(OPERATOR_ACTIONS).toEqual(["pause", "resume", "close"]);
  });

  it("refuses a join from an identity without a linked wallet", () => {
    expect(clientEventRefusal({ type: "join", githubId: 1 }, false)).toBe("not-linked");
  });

  it("records an attestation whose session lapsed meanwhile, as the alarm would have", () => {
    const s = holding(5);
    const lapsed = attestStep(s, 5, 1, OPEN + 90_000, NEVER);
    expect(lapsed.ok && lapsed.effects).toEqual([
      { type: "release", githubId: 5, seq: 1, reason: "no-show" },
    ]);
    expect(lapsed.state.slot).toBeNull();
  });

  it("refuses an attestation while the session's verification is in flight", () => {
    const up = step(holding(5), { type: "uploaded", githubId: 5, circuit: "shield" }, OPEN).state;
    expect(attestStep(up, 5, 1, OPEN, NEVER)).toEqual({ ok: false, state: up, refusal: "busy" });
  });

  it("refuses an attestation once the ceremony is sealed", () => {
    const sealed: QueueState = { ...opened(), phase: "FINALIZED" };
    expect(attestStep(sealed, 5, 1, OPEN, NEVER)).toEqual({
      ok: false,
      state: sealed,
      refusal: "finalized",
    });
  });

  it("refuses every attestation from the announced beacon time on, so the head stops moving", () => {
    const s = holding(5);
    expect(attestStep(s, 5, 1, OPEN, OPEN)).toEqual({
      ok: false,
      state: s,
      refusal: "attestation-closed",
    });
    expect(attestStep(s, 5, 1, OPEN - 1, OPEN).ok).toBe(true);
  });

  it("ends a session by its attestation only if it is still the caller's slot", () => {
    const s = holding(5);
    const ends = attestStep(s, 5, 1, OPEN, NEVER);
    expect(ends.ok && ends.state.slot).toBeNull();
    for (const [gid, seq] of [
      [5, 2],
      [6, 1],
    ] as const) {
      const r = attestStep(s, gid, seq, OPEN, NEVER);
      expect(r).toEqual({ ok: true, state: s, effects: [] });
    }
  });
});

describe("views", () => {
  it("shows the public status without identities, and the head a contributor downloads", () => {
    const s = holding(5);
    expect(publicStatusOf(s)).toEqual({
      phase: "OPEN",
      queued: 0,
      active: true,
      sessions: 1,
      contributors: 0,
    });
    const standing = {
      noShows: 0,
      cooldownUntil: 0,
      rejected: 0,
      banned: false,
      infraResults: 0,
      held: false,
    };
    const counted = {
      ...s,
      identities: {
        "5": { ...standing, accepted: ["shield" as const] },
        "6": { ...standing, accepted: [] },
      },
    };
    expect(publicStatusOf(counted)).toMatchObject({ sessions: 1, contributors: 1 });
    expect(headView({ index: 2, outputSha256: "ab" }, "shield")).toEqual({
      index: 2,
      output_sha256: "ab",
      url: "/artifacts/contributions/shield/2.zkey",
    });
    expect(headView({ index: 0, outputSha256: "ab" }, "shield").url).toBe(
      "/artifacts/genesis/shield.genesis.zkey",
    );
  });
});

describe("records of effects", () => {
  it("records phase changes and an accepted contribution, in effect order", () => {
    const c = contribution(1);
    const records = recordsOfEffects(
      "x",
      [
        { type: "grant", githubId: 5, seq: 1 },
        { type: "state", from: "OPEN", to: "PAUSED", reason: "operator" },
        { type: "accepted", githubId: 5, seq: 1, circuit: "shield" },
      ],
      "2026-10-01T00:00:00.000Z",
      c,
    );
    expect(records.map((r) => r.type)).toEqual(["state", "contribution"]);
    expect(records[1]).toBe(c);
    expect(
      recordsOfEffects("x", [{ type: "accepted", githubId: 5, seq: 1, circuit: "shield" }], "t"),
    ).toEqual([]);
  });

  it("records finalization as the sealed beacon, and never without it", () => {
    const beacon = buildBeaconRecord({
      ceremonyId: ID,
      chainHash: DRAND.chainHash,
      round: R1000,
      iterationsExp: 10,
      relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
      sealedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(recordsOfEffects(ID, [{ type: "finalized" }], "t", beacon)).toEqual([beacon]);
    expect(() => recordsOfEffects(ID, [{ type: "finalized" }], "t")).toThrow(/sealed beacon/);
    expect(() => recordsOfEffects(ID, [{ type: "finalized" }], "t", contribution(1))).toThrow(
      /sealed beacon/,
    );
  });
});
