/**
 * Attacks on the SPEC §2.6 final-key checks (re-walk, beacon policy, minimum, δ ≠ γ and δ ≠
 * genesis δ) with hostile variations of the real testnet-rehearsal-1 finals and their vk.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type MpcParams, readMpcParams } from "../../../src/formats/mpc";
import { checkDelta, checkFinalEntries, type FinalExpectation } from "../../../src/verification";

/** The finished rehearsal with its whole chain (fetch-test-inputs.sh), or the local one. */
const DIR =
  process.env.ORBINUM_REHEARSAL_DIR ??
  join(import.meta.dirname, "..", "..", "..", "..", "..", "artifacts", "testnet-rehearsal-1");
const Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const CIRCUITS = ["shield", "unshield", "transfer"] as const;

type Entry = MpcParams["entries"][number];

/** A copy of `entries` with entry `i` patched. */
const editEntry = (entries: MpcParams["entries"], i: number, patch: Partial<Entry>) => {
  const es = entries.slice();
  es[i] = { ...es.at(i)!, ...patch } as Entry;
  return es;
};
/** The field negation of a decimal coordinate. */
const neg = (s: string) => (BigInt(s) === 0n ? "0" : (Q - BigInt(s)).toString());
const vkOf = (c: string) =>
  JSON.parse(readFileSync(join(DIR, "final", `${c}.vk.json`), "utf8")) as Record<string, any>;
/** The genesis has δ = 1: its vk_delta_2 is the G2 generator, i.e. γ. */
const genesisVk = (c: string) => ({ vk_delta_2: vkOf(c).vk_gamma_2 });
const vk = () => vkOf("shield");

describe.skipIf(!existsSync(DIR))("final checks on the rehearsal finals", () => {
  // Read in beforeAll, not while collecting: vitest still runs a skipped suite's body.
  let transcript: { records: Array<Record<string, any>> };
  let init: { circuits: Array<{ name: string; cs_hash: string }> };
  let beacon: Record<string, any>;
  beforeAll(() => {
    transcript = JSON.parse(readFileSync(join(DIR, "transcript.json"), "utf8"));
    init = JSON.parse(readFileSync(join(DIR, "genesis", "init.json"), "utf8"));
    beacon = transcript.records.find((r) => r.type === "beacon")!;
  });
  const params = new Map<string, MpcParams>();
  const paramsOf = (c: string) => {
    let p = params.get(c);
    if (!p) {
      p = readMpcParams(new Uint8Array(readFileSync(join(DIR, "final", `${c}.final.zkey`))));
      params.set(c, p);
    }
    return p;
  };
  const expectationOf = (c: string): FinalExpectation => {
    const acc = transcript.records.filter((r) => r.type === "contribution" && r.circuit === c);
    return {
      csHash: init.circuits.find((x) => x.name === c)!.cs_hash,
      contributionHashes: acc.map((r) => r.contribution_hash),
      contributionNames: acc.map((r) => r.zkey_name),
      minContributions: 3,
      beacon: { randomness: beacon.randomness, iterationsExp: beacon.iterations_exp },
    };
  };
  const p = () => paramsOf("shield");
  const e = () => expectationOf("shield");
  const withEntries = (entries: MpcParams["entries"]): MpcParams => ({ ...p(), entries });

  it.each(CIRCUITS)("accepts the genuine %s final (re-walk and δ checks)", (c) => {
    expect(checkFinalEntries(paramsOf(c), expectationOf(c))).toEqual([]);
    expect(checkDelta(vkOf(c), genesisVk(c))).toEqual([]);
  });

  describe("re-walk and beacon policy (shield)", () => {
    it("refuses a key whose beacon entry was dropped", () => {
      expect(checkFinalEntries(withEntries(p().entries.slice(0, -1)), e()).length).toBeGreaterThan(
        0,
      );
    });
    it("refuses a beacon that is not the last entry", () => {
      const es = p().entries.slice();
      [es[2], es[3]] = [es[3]!, es[2]!];
      expect(checkFinalEntries(withEntries(es), e()).length).toBeGreaterThan(0);
    });
    it("refuses a beacon applied twice", () => {
      expect(
        checkFinalEntries(withEntries([...p().entries, p().entries.at(-1)!]), e()).length,
      ).toBeGreaterThan(0);
    });
    it("refuses the beacon in place of the first contribution", () => {
      const es = p().entries.slice();
      es[0] = es.at(-1)!;
      expect(checkFinalEntries(withEntries(es), e()).length).toBeGreaterThan(0);
    });
    it("refuses a contribution entry retyped as a beacon", () => {
      const es = editEntry(p().entries, 1, { kind: "beacon" });
      expect(checkFinalEntries(withEntries(es), e())).toContain("entry 2 is not a contribution");
    });
    it("refuses a contribution renamed after it was recorded (KL-7)", () => {
      const es = editEntry(p().entries, 0, { name: "evil" });
      expect(checkFinalEntries(withEntries(es), e())).toContain(
        "entry 1 is named differently from the transcript",
      );
    });
    it("refuses an entry hash from another chain", () => {
      const es = editEntry(p().entries, 1, { hash: "00".repeat(64) });
      expect(checkFinalEntries(withEntries(es), e())).toContain(
        "entry 2 differs from the transcript",
      );
    });
    it("refuses the key of another circuit", () => {
      expect(checkFinalEntries(paramsOf("unshield"), e())).toContain(
        "csHash differs: another circuit",
      );
    });
    it.each([4, 100, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
      "refuses fewer contributions than min_contributions = %s",
      (min) => {
        expect(checkFinalEntries(p(), { ...e(), minContributions: min }).length).toBeGreaterThan(0);
      },
    );
    it.each([0, -1, 1, 3])("clamps min_contributions = %s to at least 1", (min) => {
      expect(checkFinalEntries(p(), { ...e(), minContributions: min })).toEqual([]);
    });
    it("refuses a key with no contribution (beacon only), even with min 0", () => {
      const only = withEntries([p().entries.at(-1)!]);
      const r = checkFinalEntries(only, {
        ...e(),
        contributionHashes: [],
        contributionNames: [],
        minContributions: 0,
      });
      expect(r.length).toBeGreaterThan(0);
    });
    it.each([
      ["another randomness", () => ({ randomness: "00".repeat(32) })],
      ["the randomness in uppercase", () => ({ randomness: e().beacon.randomness.toUpperCase() })],
      ["iterations 9", () => ({ iterationsExp: 9 })],
      ["iterations 11", () => ({ iterationsExp: 11 })],
      ["iterations 25", () => ({ iterationsExp: 25 })],
    ])("refuses a beacon that differs from the sealed one: %s", (_, over) => {
      const b = { ...e().beacon, ...over() };
      expect(checkFinalEntries(p(), { ...e(), beacon: b }).length).toBeGreaterThan(0);
    });
    // The 2^10..2^24 range is enforced on the announcement and beacon record, not here.
    it("compares the beacon's iterations only against the sealed record", () => {
      const last = p().entries.length - 1;
      const es = editEntry(p().entries, last, { numIterationsExp: 25 });
      expect(
        checkFinalEntries(withEntries(es), {
          ...e(),
          beacon: { ...e().beacon, iterationsExp: 25 },
        }),
      ).toEqual([]);
    });
  });

  describe("δ ≠ γ and δ ≠ genesis δ (vk.json)", () => {
    it("refuses δ = γ for both reasons", () => {
      const r = checkDelta({ ...vk(), vk_delta_2: vk().vk_gamma_2 }, genesisVk("shield"));
      expect(r).toContain("δ = γ: phase 2 was skipped");
      expect(r).toContain("δ equals the genesis δ");
    });
    it("refuses δ = genesis δ when the genesis vk spells it differently from γ", () => {
      const g = vk().vk_gamma_2;
      expect(checkDelta({ ...vk(), vk_delta_2: g }, { vk_delta_2: g }).length).toBeGreaterThan(0);
    });
    it.each([
      ["a coordinate + q", (d: any) => [[(BigInt(d[0][0]) + Q).toString(), d[0][1]], d[1], d[2]]],
      ["a leading zero", (d: any) => [[`0${d[0][0]}`, d[0][1]], d[1], d[2]]],
      ["hex", (d: any) => [[`0x${BigInt(d[0][0]).toString(16)}`, d[0][1]], d[1], d[2]]],
      ["z ≠ 1", (d: any) => [d[0], d[1], ["2", "0"]]],
      ["numbers", (d: any) => [[Number(d[0][0]), d[0][1]], d[1], d[2]]],
      ["missing", () => undefined],
      ["projective with 4 coords", (d: any) => [...d, ["1", "0"]]],
    ])("fails closed on δ with %s", (_, edit) => {
      expect(
        checkDelta({ ...vk(), vk_delta_2: edit(vk().vk_delta_2) }, genesisVk("shield")).length,
      ).toBeGreaterThan(0);
    });
    it("fails closed on δ = γ spelled with a coordinate + q", () => {
      const g = vk().vk_gamma_2;
      const spelled = [[(BigInt(g[0][0]) + Q).toString(), g[0][1]], g[1], g[2]];
      expect(
        checkDelta({ ...vk(), vk_delta_2: spelled }, genesisVk("shield")).length,
      ).toBeGreaterThan(0);
    });
    it("refuses δ = −γ, as forgeable as δ = γ", () => {
      const g = vk().vk_gamma_2;
      const minus = [g[0], [neg(g[1][0]), neg(g[1][1])], g[2]];
      expect(checkDelta({ ...vk(), vk_delta_2: minus }, genesisVk("shield"))).toEqual([
        "δ = −γ: as forgeable as δ = γ",
      ]);
    });
    // Curve membership is checked by zkey verification and the Rust verifier.
    it("leaves curve membership of δ to the zkey verification", () => {
      const d = vk().vk_delta_2;
      const off = [d[0], [((BigInt(d[1][0]) + 1n) % Q).toString(), d[1][1]], d[2]];
      expect(checkDelta({ ...vk(), vk_delta_2: off }, genesisVk("shield"))).toEqual([]);
    });
  });
});
