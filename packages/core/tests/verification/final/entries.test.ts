/** The final key embeds exactly the recorded chain, then the sealed beacon. SPEC §2.6. */
import { describe, expect, it } from "vitest";
import { readMpcParams } from "../../../src/formats/mpc";
import { checkFinalEntries, type FinalExpectation } from "../../../src/verification";
import { loadZkey } from "../../support";

const final = readMpcParams(loadZkey("final"));
const [h1, h2] = final.entries.map((e) => e.hash);

/** The fixture's chain: alice, bob, then beacon 0x0102…1f with 2^10 iterations. */
const expected: FinalExpectation = {
  csHash: final.csHash,
  contributionHashes: [h1 as string, h2 as string],
  minContributions: 1,
  beacon: {
    randomness: "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    iterationsExp: 10,
  },
};

describe("checkFinalEntries (re-walk)", () => {
  it("accepts the recorded chain followed by the sealed beacon", () => {
    expect(checkFinalEntries(final, expected)).toEqual([]);
  });

  it("detects a dropped or extra contribution", () => {
    expect(checkFinalEntries(final, { ...expected, contributionHashes: [h1 as string] })).toEqual([
      "3 entries, expected 2 (1 contributions + beacon)",
    ]);
  });

  it("detects a contribution that is not the recorded one", () => {
    const res = checkFinalEntries(final, {
      ...expected,
      contributionHashes: [h1 as string, "ff".repeat(64)],
    });
    expect(res).toEqual(["entry 2 differs from the transcript"]);
  });

  it("detects a beacon other than the sealed one", () => {
    const res = checkFinalEntries(final, {
      ...expected,
      beacon: { randomness: "00".repeat(32), iterationsExp: 11 },
    });
    expect(res).toEqual(["beacon value differs", "beacon iterations differ"]);
  });

  it("detects another circuit", () => {
    expect(checkFinalEntries(final, { ...expected, csHash: "00" })).toContain(
      "csHash differs: another circuit",
    );
  });

  it("rejects a chain without a beacon", () => {
    const two = readMpcParams(loadZkey("2"));
    expect(checkFinalEntries(two, { ...expected, contributionHashes: [h1 as string] })).toEqual([
      "last entry is not a beacon",
      "beacon value differs",
      "beacon iterations differ",
    ]);
  });
});

describe("checkFinalEntries against keys with too few contributions", () => {
  /** snarkjs verifies this key ("ZKey Ok!"), but its δ comes only from the public beacon. */
  const beaconOnly = readMpcParams(loadZkey("beacon_only"));

  it("rejects the beacon applied straight onto the genesis, even when the transcript agrees", () => {
    expect(
      checkFinalEntries(beaconOnly, { ...expected, contributionHashes: [], minContributions: 0 }),
    ).toEqual(["0 contributions: at least 1 required"]);
  });

  it("enforces the announced minimum", () => {
    expect(checkFinalEntries(final, { ...expected, minContributions: 50 })).toEqual([
      "2 contributions: at least 50 required",
    ]);
  });

  it("detects an entry renamed after it was recorded (names are outside h_k)", () => {
    const named = { ...expected, contributionNames: ["alice", "bob"] };
    expect(checkFinalEntries(final, named)).toEqual([]);
    expect(checkFinalEntries(final, { ...named, contributionNames: ["alice", "mallory"] })).toEqual(
      ["entry 2 is named differently from the transcript"],
    );
  });

  it("fails closed on a minimum that is not a number", () => {
    const res = checkFinalEntries(final, { ...expected, minContributions: Number.NaN });
    expect(res[0]).toMatch(/at least Infinity required/);
  });
});

describe("checkFinalEntries keeps the recorded kinds", () => {
  it("flags a recorded contribution relabelled as a beacon (same hash)", () => {
    const entries = [...final.entries];
    entries[0] = { ...(entries[0] as (typeof entries)[0]), kind: "beacon" };
    const relabelled = { ...final, entries };
    expect(checkFinalEntries(relabelled, { ...expected, minContributions: 1 })).toEqual([
      "entry 1 is not a contribution",
    ]);
  });
});
