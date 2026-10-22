/** An upload extends the recorded head by exactly one new, real contribution. SPEC §2.5 #3. */
import { describe, expect, it } from "vitest";
import { G1_GENERATOR as GENESIS_DELTA_G1 } from "../../../src/formats/bn254";
import { type MpcParams, readMpcParams } from "../../../src/formats/mpc";
import { checkContinuity, type HeadExpectation } from "../../../src/verification/upload";
import { editSection, loadZkey, mpcEntryOffsets } from "../../support";

const genesis = readMpcParams(loadZkey("0"));
const one = readMpcParams(loadZkey("1"));
const two = readMpcParams(loadZkey("2"));
const final = readMpcParams(loadZkey("final"));

/** The head as recorded after the first `n` entries of `params`. */
const headAfter = (params: MpcParams, n: number): HeadExpectation => ({
  csHash: params.csHash,
  previous: params.entries
    .slice(0, n)
    .map((e) => ({ hash: e.hash, name: e.name ?? "", deltaAfter: e.deltaAfter })),
});

/** A copy of `params` with entry `i` modified. */
const edit = (params: MpcParams, i: number, patch: object): MpcParams => ({
  ...params,
  entries: params.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)),
});

describe("checkContinuity", () => {
  it("accepts the first contribution on top of the genesis", () => {
    expect(checkContinuity(one, headAfter(one, 0))).toMatchObject({
      ok: true,
      index: 1,
      contribution: { name: "alice" },
    });
  });

  it("accepts a contribution that extends the recorded head", () => {
    expect(checkContinuity(two, headAfter(one, 1))).toMatchObject({ ok: true, index: 2 });
  });

  it("rejects another circuit", () => {
    const head = { ...headAfter(one, 1), csHash: "00".repeat(64) };
    expect(checkContinuity(two, head)).toEqual({ ok: false, reason: "cs-hash-mismatch" });
  });

  it("rejects a stale or skipped head", () => {
    expect(checkContinuity(two, headAfter(one, 0))).toMatchObject({
      ok: false,
      reason: "wrong-count",
      expected: 1,
      actual: 2,
    });
  });

  it("rejects a chain that replaced an earlier contribution", () => {
    const head = headAfter(one, 1);
    const forged = { ...head, previous: [{ ...head.previous[0], hash: "ab".repeat(64) }] };
    expect(checkContinuity(two, forged as HeadExpectation)).toEqual({
      ok: false,
      reason: "prefix-mismatch",
      index: 1,
    });
  });

  it("rejects a beacon presented as a contribution", () => {
    expect(checkContinuity(final, headAfter(final, 2))).toEqual({
      ok: false,
      reason: "not-a-contribution",
    });
  });

  it("starts from the genesis δ, which is the G1 generator", () => {
    expect(genesis.entries).toEqual([]);
    expect(GENESIS_DELTA_G1).toBe(`${"00".repeat(31)}01${"00".repeat(31)}02`);
  });
});

describe("checkContinuity against no-op contributions (secret = 1)", () => {
  it("rejects a first contribution that leaves the genesis δ unchanged", () => {
    const noop = edit(one, 0, { deltaAfter: GENESIS_DELTA_G1 });
    expect(checkContinuity(noop, headAfter(one, 0))).toEqual({
      ok: false,
      reason: "noop-contribution",
    });
  });

  it("rejects a contribution that leaves the previous δ unchanged", () => {
    const noop = edit(two, 1, { deltaAfter: two.entries[0]?.deltaAfter });
    expect(checkContinuity(noop, headAfter(one, 1))).toEqual({
      ok: false,
      reason: "noop-contribution",
    });
  });
});

describe("checkContinuity against cancelled contributions", () => {
  it("rejects a contribution that brings δ back to the genesis δ (x, then 1/x)", () => {
    const back = edit(two, 1, { deltaAfter: GENESIS_DELTA_G1 });
    expect(checkContinuity(back, headAfter(one, 1))).toEqual({
      ok: false,
      reason: "noop-contribution",
    });
  });
});

describe("checkContinuity against rewritten or hostile names", () => {
  it("rejects an upload that renames an earlier contribution", () => {
    const renamed = edit(two, 0, { name: "mallory" });
    expect(checkContinuity(renamed, headAfter(one, 1))).toEqual({
      ok: false,
      reason: "name-rewritten",
      index: 1,
    });
  });

  it.each([
    ["terminal escapes", "\u001b[31mred"],
    ["a fake beacon label", "drand quicknet round 1\nZKey Ok!"],
    ["an over-long name", "x".repeat(65)],
    ["no name", undefined],
  ])("rejects a new contribution named with %s", (_, name) => {
    expect(checkContinuity(edit(two, 1, { name }), headAfter(one, 1))).toEqual({
      ok: false,
      reason: "bad-name",
    });
  });
});

describe("checkContinuity against fields outside h_k", () => {
  it("refuses a recorded contribution relabelled as a beacon (same hash) when it is read", () => {
    const relabelled = editSection(loadZkey("2"), 10, (sec) => {
      new DataView(sec.buffer, sec.byteOffset).setUint32(mpcEntryOffsets(sec, 0).type, 1, true);
      return sec;
    });
    // A beacon carries its iterations and hash; a relabelled contribution has neither.
    expect(() => readMpcParams(relabelled)).toThrow(/wrong beacon parameters/);
  });

  it("rejects a new contribution that carries beacon parameters", () => {
    const params = readMpcParams(loadZkey("1"));
    const entry = params.entries[0] as MpcParams["entries"][number];
    const tagged = { ...params, entries: [{ ...entry, numIterationsExp: 10 }] };
    expect(checkContinuity(tagged, { csHash: params.csHash, previous: [] })).toEqual({
      ok: false,
      reason: "not-a-contribution",
    });
    const hashed = { ...params, entries: [{ ...entry, beaconHash: "01".repeat(32) }] };
    expect(checkContinuity(hashed, { csHash: params.csHash, previous: [] })).toEqual({
      ok: false,
      reason: "not-a-contribution",
    });
  });

  it("rejects a contribution that cancels back to an earlier (not the last) δ", () => {
    const third = {
      kind: "contribution" as const,
      name: "carol",
      deltaAfter: final.entries[0]?.deltaAfter as string,
      numIterationsExp: undefined,
      beaconHash: undefined,
    };
    const back = edit(final, 2, third);
    expect(checkContinuity(back, headAfter(final, 2))).toEqual({
      ok: false,
      reason: "noop-contribution",
    });
  });
});
