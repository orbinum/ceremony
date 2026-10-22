/**
 * Parsers and pre-checks on mutated real files: only success or a definitive rejection, never a
 * crash. SPEC §2.5.
 */
import { describe, expect, it } from "vitest";
import { checkZkeyStructure, readMpcParams } from "../../src/formats/mpc";
import { readR1csHeader } from "../../src/formats/r1cs";
import { FormatError } from "../../src/primitives/errors";
import { sha256Hex } from "../../src/primitives/hashing";
import { type CurrentHead, genesisLayoutOf, precheckUpload } from "../../src/verification";
import { ensure, loadR1cs, loadZkey, mulberry32, pick, splitBinfile } from "../support";

/** Runs `parse` and returns how it ended: never anything but success or a `FormatError`. */
function outcome(parse: () => unknown): "ok" | "format" {
  try {
    parse();
    return "ok";
  } catch (error) {
    if (error instanceof FormatError) return "format";
    throw error;
  }
}

/** Byte offset of section `type`'s data in a binfile. */
function sectionOffset(bytes: Uint8Array, type: number): { start: number; end: number } {
  let pos = 12;
  for (const s of splitBinfile(bytes).sections) {
    if (s.type === type) return { start: pos + 12, end: pos + 12 + s.data.length };
    pos += 12 + s.data.length;
  }
  throw new Error(`no section ${type}`);
}

describe("fuzz: zkey parsers only ever succeed or raise FormatError", () => {
  const two = loadZkey("2");
  const mpc = sectionOffset(two, 10);
  const one = readMpcParams(loadZkey("1"));
  const layout = genesisLayoutOf(loadZkey("0"));
  const head: CurrentHead = {
    outputSha256: sha256Hex(loadZkey("1")),
    csHash: one.csHash,
    previous: one.entries.map((e) => ({
      hash: e.hash,
      name: e.name ?? "",
      deltaAfter: e.deltaAfter,
    })),
  };
  /** The honest claim: the real h_k, so only what the flip breaks can fail. */
  const contributionHash = readMpcParams(two).entries[1]?.hash as string;
  const precheck = (bytes: Uint8Array) =>
    precheckUpload(
      bytes,
      { inputSha256: head.outputSha256, outputSha256: sha256Hex(bytes), contributionHash },
      head,
      layout,
    );
  /** Where an upload may differ without the pre-checks noticing: δ2 and content left to `zkvi`. */
  const groth16 = sectionOffset(two, 2).start;
  const unchecked = [
    { start: groth16 + layout.deltaFrom + 64, end: groth16 + layout.deltaTo },
    ...[3, 4, 5, 6, 7, 8, 9].map((t) => sectionOffset(two, t)),
  ];

  it(
    "survives 2,000 random byte flips; what passes differs only where zkvi decides",
    { timeout: 60_000 },
    () => {
      const rand = mulberry32(0x5eed);
      const reasons = new Map<string, number>();
      for (let i = 0; i < 2000; i++) {
        const bytes = two.slice();
        const at = pick(rand, bytes.length);
        bytes[at] = (bytes[at] as number) ^ (1 + pick(rand, 255));
        outcome(() => checkZkeyStructure(bytes));
        outcome(() => readMpcParams(bytes));
        const r = precheck(bytes);
        const key = r.ok ? "ok" : r.reason;
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
        if (r.ok) {
          ensure(
            unchecked.some((s) => at >= s.start && at < s.end) ||
              (at >= mpc.start && r.name !== "bob"),
            `a flip at ${at} passed outside the content zkvi checks`,
          );
        } else if (r.reason === "client-hash-mismatch") {
          // Past continuity: the recorded prefix is intact.
          const [first] = readMpcParams(bytes).entries;
          ensure(first?.hash === head.previous[0]?.hash, "the recorded h_k is unchanged");
          ensure(first?.name === head.previous[0]?.name, "the recorded name is unchanged");
        }
      }
      expect(reasons.get("ok")).toBeGreaterThan(0);
      expect(reasons.get("malformed")).toBeGreaterThan(0);
    },
  );

  it("reaches every continuity branch by flips in the MPC section", { timeout: 60_000 }, () => {
    const reasons = new Set<string>();
    for (let at = mpc.start; at < mpc.end; at++) {
      for (const mask of [0x01, 0x60, 0x80]) {
        const bytes = two.slice();
        bytes[at] = (bytes[at] as number) ^ mask;
        const r = precheck(bytes);
        reasons.add(r.ok ? "ok" : r.reason);
      }
    }
    expect([...reasons].toSorted()).toEqual([
      "bad-name",
      "client-hash-mismatch",
      "cs-hash-mismatch",
      "malformed",
      "name-rewritten",
      // "not-a-contribution" is out of reach: a retyped entry no longer reads (beacon parameters).
      "ok",
      "prefix-mismatch",
    ]);
  });

  it("survives every truncation of the MPC section", () => {
    for (let end = mpc.start; end < mpc.end; end += 7) {
      expect(outcome(() => readMpcParams(two.subarray(0, end)))).toBe("format");
    }
  });
});

describe("fuzz: r1cs header parser", () => {
  it("survives byte flips and truncations", () => {
    const r1cs = loadR1cs();
    const rand = mulberry32(42);
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const bytes = r1cs.slice(0, 1 + pick(rand, r1cs.length));
      const at = pick(rand, bytes.length);
      bytes[at] = (bytes[at] as number) ^ (1 + pick(rand, 255));
      seen.add(outcome(() => readR1csHeader(bytes)));
    }
    expect(seen.has("format")).toBe(true);
  });
});
