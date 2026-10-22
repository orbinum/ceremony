/** The hash chain rooted in the announcement, and records validated before chaining. SPEC §6.3. */
import { describe, expect, it } from "vitest";
import { FormatError } from "../../../src/primitives/errors";
import { sha256Hex } from "../../../src/primitives/hashing";
import {
  appendRecord,
  type BeaconRecord,
  type Chained,
  chainGenesis,
  type ContributionRecord,
  headOf,
  type StateRecord,
  verifyChain,
} from "../../../src/ceremony/transcript";

const genesis = chainGenesis("test-1", { any: "anchor" });

const contribution = (circuit: "shield" | "transfer", index: number): ContributionRecord => ({
  type: "contribution",
  ceremony_id: "test-1",
  seq: index,
  circuit,
  index,
  input_sha256: `${index - 1}`.padStart(64, "0"),
  output_sha256: `${index}`.padStart(64, "0"),
  contribution_hash: `${index}`.padStart(128, "a"),
  client_contribution_hash: `${index}`.padStart(128, "a"),
  zkey_name: `local-${index}`,
  delta_after: `${index}`.padStart(128, "b"),
  method: "cli",
  client: { name: "test", version: "0", commit: "abc1234" },
  identity: null,
  link_sig: null,
  gist_url: null,
  verified_by: { verifier_version: "0", snarkjs_version: "0.7.6", at: "2026-10-06T00:00:00.000Z" },
  verifier_log_sha256: "0".repeat(64),
});

const state: StateRecord = {
  type: "state",
  ceremony_id: "test-1",
  from: "OPEN",
  to: "PAUSED",
  at: "2026-10-06T00:00:00.000Z",
  reason: "verifier down",
};

function build(): Chained[] {
  const records: Chained[] = [];
  for (const r of [contribution("shield", 1), state, contribution("shield", 2)]) {
    records.push(appendRecord(records, genesis, r));
  }
  return records;
}

describe("transcript chain", () => {
  it("roots the chain in the ceremony id and the anchor document", () => {
    expect(genesis).toMatch(/^[0-9a-f]{64}$/);
    expect(chainGenesis("test-2", { any: "anchor" })).not.toBe(genesis);
    expect(chainGenesis("test-1", { any: "other" })).not.toBe(genesis);
  });

  it("links every record to the previous one", () => {
    const records = build();
    expect(records[0]?.prev_chain).toBe(genesis);
    expect(records[1]?.prev_chain).toBe(records[0]?.chain);
    expect(verifyChain(records, genesis)).toEqual({ ok: true, head: records[2]?.chain });
  });

  it("is independent of key order (JCS)", () => {
    const [first] = build();
    const reordered = Object.fromEntries(Object.entries(first as object).toReversed());
    expect(verifyChain([reordered as Chained], genesis).ok).toBe(true);
  });

  it("detects an edited record", () => {
    const records = build();
    records[1] = { ...(records[1] as Chained), reason: "edited" } as Chained;
    expect(verifyChain(records, genesis)).toEqual({ ok: false, position: 1 });
  });

  it("detects a removed record", () => {
    const records = build();
    records.splice(1, 1);
    expect(verifyChain(records, genesis)).toEqual({ ok: false, position: 1 });
  });

  it("detects a different anchor", () => {
    expect(verifyChain(build(), chainGenesis("test-1", {})).ok).toBe(false);
  });
});

describe("appendRecord refuses malformed records before chaining them", () => {
  it.each([
    ["NaN", { seq: Number.NaN }],
    ["Infinity (1e400)", { index: JSON.parse("1e400") as number }],
    ["a lone surrogate", { zkey_name: JSON.parse('"\\ud800"') as string }],
    ["an unknown circuit", { circuit: "../x" }],
    ["uppercase hex", { output_sha256: "AB".repeat(32) }],
    ["an extra field", { extra: 1 }],
    [
      "a non-ISO time",
      { verified_by: { verifier_version: "0", snarkjs_version: "0.7.6", at: "now" } },
    ],
  ])("rejects %s", (_, patch) => {
    const bad = { ...contribution("shield", 1), ...patch } as ContributionRecord;
    expect(() => appendRecord([], genesis, bad)).toThrow(FormatError);
  });

  it("bounds the beacon iterations to what the independent verifier derives (2^10..2^24)", () => {
    const beacon: BeaconRecord = {
      type: "beacon",
      ceremony_id: "test-1",
      source: "drand",
      chain_hash: "00".repeat(32),
      round: 1,
      randomness: "11".repeat(32),
      signature: "22".repeat(48),
      iterations_exp: 24,
      relays: ["https://api.drand.sh"],
      sealed_at: "2026-10-06T00:00:00.000Z",
    };
    expect(() => appendRecord([], genesis, beacon)).not.toThrow();
    expect(() => appendRecord([], genesis, { ...beacon, iterations_exp: 25 })).toThrow(FormatError);
  });

  it("rejects an unknown record type", () => {
    expect(() =>
      appendRecord([], genesis, { ...state, type: "admin" } as unknown as StateRecord),
    ).toThrow(FormatError);
  });
});

describe("headOf", () => {
  const anchor = { sha256: sha256Hex(new Uint8Array([1])), csHash: "cs" };

  it("starts at the genesis", () => {
    expect(headOf([], "shield", anchor)).toEqual({
      index: 0,
      outputSha256: anchor.sha256,
      csHash: "cs",
      previous: [],
    });
  });

  it("follows only the circuit's own contributions", () => {
    const records = build();
    const head = headOf(records, "shield", anchor);
    expect(head.index).toBe(2);
    expect(head.outputSha256).toBe(contribution("shield", 2).output_sha256);
    expect(head.previous).toHaveLength(2);
    expect(head.previous[1]).toEqual({
      hash: contribution("shield", 2).contribution_hash,
      name: "local-2",
      deltaAfter: contribution("shield", 2).delta_after,
    });
    expect(headOf(records, "transfer", anchor).index).toBe(0);
  });
});
