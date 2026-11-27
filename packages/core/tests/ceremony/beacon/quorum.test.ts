/**
 * Agreement among drand relays on the announced round: only verified answers count, and too few
 * agreeing relays is a refusal.
 */
import { describe, expect, it } from "vitest";
import { relayQuorum } from "../../../src/ceremony/beacon";
import { R1000, R1001 } from "../../support";

const answer = (relay: string, body: unknown) => ({ relay, body });

describe("relay quorum", () => {
  it("takes the verified value at least two relays agree on, whatever its hex case", () => {
    const upper = { ...R1000, signature: R1000.signature.toUpperCase() };
    const r = relayQuorum(1000, [answer("a", R1000), answer("b", upper), answer("c", null)]);
    expect(r).toEqual({ ok: true, value: R1000, relays: ["a", "b"] });
  });

  it("ignores invalid answers, other rounds and a relay counted twice", () => {
    const forged = { ...R1000, randomness: "00".repeat(32) };
    const r = relayQuorum(1000, [
      answer("a", R1000),
      answer("a", R1000),
      answer("b", forged),
      answer("c", R1001),
    ]);
    expect(r).toEqual({ ok: false, reason: "fewer than 2 relays agree on a valid round 1000" });
  });
});

describe("relay quorum binds the requested round", () => {
  it("refuses two relays agreeing on another round than the one asked for", () => {
    const r = relayQuorum(1000, [answer("a", R1001), answer("b", R1001)]);
    expect(r).toEqual({ ok: false, reason: "fewer than 2 relays agree on a valid round 1000" });
  });
});
