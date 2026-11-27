/**
 * drand round timing, and BLS verification against the pinned key on real quicknet rounds fetched
 * from api.drand.sh.
 */
import { describe, expect, it } from "vitest";
import {
  type DrandRound,
  roundAt,
  roundTime,
  verifyDrandRound,
} from "../../../src/ceremony/beacon";
import { DRAND } from "../../../src/config";

const R1000: DrandRound = {
  round: 1000,
  randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
};
const R1001: DrandRound = {
  round: 1001,
  randomness: "b0a591ad1b9002cfc372ac6e30abd3da8d3088d4caae026961743474fb94235f",
  signature:
    "b33bf3667cbd5a82de3a24b4e0e9fe5513cc1a0e840368c6e31f5fcfa79bea03f73896b25883abf2853d10337fb8fa41",
};

describe("verifyDrandRound", () => {
  it("accepts real quicknet rounds", () => {
    expect(verifyDrandRound(R1000)).toBe(true);
    expect(verifyDrandRound(R1001)).toBe(true);
  });

  it("rejects a valid signature presented for another round", () => {
    expect(verifyDrandRound({ ...R1001, round: 1000 })).toBe(false);
  });

  it("rejects randomness that is not SHA-256 of the signature", () => {
    expect(verifyDrandRound({ ...R1000, randomness: R1001.randomness })).toBe(false);
  });

  it("rejects garbage", () => {
    expect(verifyDrandRound({ round: 1, randomness: "00", signature: "zz" })).toBe(false);
    expect(verifyDrandRound({ ...R1000, round: 0 })).toBe(false);
  });
});

describe("round timing", () => {
  it("emits round 1 at genesis and one round per period", () => {
    expect(roundTime(1)).toBe(DRAND.genesisTime);
    expect(roundTime(1000)).toBe(DRAND.genesisTime + 999 * DRAND.periodSeconds);
  });

  it("selects the first round emitted at or after a time", () => {
    const t = roundTime(1000);
    expect(roundAt(t)).toBe(1000);
    expect(roundAt(t + 1)).toBe(1001);
    expect(roundAt(t - 1)).toBe(1000);
    expect(roundTime(roundAt(t + 1))).toBeGreaterThanOrEqual(t + 1);
  });
});
