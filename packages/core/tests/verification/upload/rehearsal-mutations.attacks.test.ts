/**
 * Attacks the SPEC §2.5 pre-check (checks 0–4) with hostile layouts and bytes built from the real
 * testnet-rehearsal-1 keys. Every mutation must end as `ok` or a definitive rejection, never a
 * throw (a throw is `infra`, a ceremony pause), and `ok` only where zkvi decides.
 * The default run covers shield fully and samples unshield and transfer; set
 * `ORBINUM_EXHAUSTIVE=1` for every key and the full random-flip counts (several minutes).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMpcParams } from "../../../src/formats/mpc";
import { sha256Hex } from "../../../src/primitives/hashing";
import {
  type CurrentHead,
  genesisLayoutOf,
  precheckUpload,
  REJECT_REASONS,
} from "../../../src/verification";
import {
  bigToLe,
  editSection,
  joinBinfile,
  leToBig,
  mpcEntryOffsets,
  mulberry32,
  pick,
  splitBinfile,
} from "../../support";

const EXHAUSTIVE = process.env.ORBINUM_EXHAUSTIVE === "1";
/** The finished rehearsal with its whole chain (fetch-test-inputs.sh), or the local one. */
const DIR =
  process.env.ORBINUM_REHEARSAL_DIR ??
  join(import.meta.dirname, "..", "..", "..", "..", "..", "artifacts", "testnet-rehearsal-1");
const CIRCUITS = ["shield", "unshield", "transfer"] as const;
type Circuit = (typeof CIRCUITS)[number];
const Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const ALL_KEYS = CIRCUITS.flatMap((c) => [1, 2, 3].map((k) => [c, k] as const));
/** Every shield key plus one key of each larger circuit. */
const SAMPLE_KEYS = [
  ["shield", 1],
  ["shield", 2],
  ["shield", 3],
  ["unshield", 2],
  ["transfer", 3],
] as const;

const load = (path: string) => new Uint8Array(readFileSync(join(DIR, path)));

interface Case {
  circuit: Circuit;
  k: number;
  bytes: Uint8Array;
  head: CurrentHead;
  layout: ReturnType<typeof genesisLayoutOf>;
  hash: string;
}

const cache = new Map<string, Case>();
/** Contribution k of `circuit` with the head it was accepted on. */
function caseOf(circuit: Circuit, k: number): Case {
  const key = `${circuit}/${k}`;
  let c = cache.get(key);
  if (c) return c;
  const genesis = load(`genesis/${circuit}.genesis.zkey`);
  const prev = k === 1 ? genesis : load(`contributions/${circuit}/${k - 1}.zkey`);
  const bytes = load(`contributions/${circuit}/${k}.zkey`);
  const entries = readMpcParams(bytes).entries;
  const head: CurrentHead = {
    outputSha256: sha256Hex(prev),
    csHash: readMpcParams(genesis).csHash,
    previous: entries
      .slice(0, k - 1)
      .map((e) => ({ hash: e.hash, name: e.name ?? "", deltaAfter: e.deltaAfter })),
  };
  c = {
    circuit,
    k,
    bytes,
    head,
    layout: genesisLayoutOf(genesis),
    hash: entries[k - 1]?.hash as string,
  };
  cache.set(key, c);
  return c;
}

type Outcome = { ok: true } | { ok: false; reason: string; detail?: string } | { threw: unknown };

/**
 * The pre-check as the verifier runs it, with the claim an attacker would make: h_k recomputed
 * from the mutated bytes when they still parse, so only what the mutation breaks can fail.
 */
function run(c: Case, bytes: Uint8Array, claimHash?: string): Outcome {
  let hash = claimHash ?? c.hash;
  if (claimHash === undefined) {
    try {
      hash = readMpcParams(bytes).entries.at(-1)?.hash ?? c.hash;
    } catch {
      // Unparseable: keep the honest claim.
    }
  }
  try {
    const r = precheckUpload(
      bytes,
      { inputSha256: c.head.outputSha256, outputSha256: sha256Hex(bytes), contributionHash: hash },
      c.head,
      c.layout,
    );
    return r.ok ? { ok: true } : { ok: false, reason: r.reason, detail: r.detail };
  } catch (error) {
    return { threw: error };
  }
}

const REJECTED = "rejected";
/** `REJECTED` for a definitive rejection with a contract reason; otherwise what went wrong. */
function verdict(o: Outcome, what: string): string {
  if ("threw" in o) return `${what}: threw (would be infra): ${String(o.threw)}`;
  if (o.ok) return `${what}: passed the pre-check`;
  return (REJECT_REASONS as readonly string[]).includes(o.reason)
    ? REJECTED
    : `${what}: unknown reason ${o.reason}`;
}
/** The verdicts that are not a rejection. */
const escaped = (verdicts: string[]) => verdicts.filter((v) => v !== REJECTED);

interface Placed {
  type: number;
  header: number;
  start: number;
  end: number;
}
/** Every section with its header offset and data range. */
function layoutOf(bytes: Uint8Array): Placed[] {
  let pos = 12;
  return splitBinfile(bytes).sections.map((s) => {
    const p = { type: s.type, header: pos, start: pos + 12, end: pos + 12 + s.data.length };
    pos = p.end;
    return p;
  });
}
const sectionOf = (c: Case, type: number) => layoutOf(c.bytes).find((s) => s.type === type)!;

const setU32 = (b: Uint8Array, at: number, v: number) =>
  new DataView(b.buffer, b.byteOffset).setUint32(at, v, true);
const setU64 = (b: Uint8Array, at: number, v: bigint) =>
  new DataView(b.buffer, b.byteOffset).setBigUint64(at, v, true);
/** The 32-byte LE element at `at` replaced by itself + q (same value mod q, other spelling). */
function plusQ(b: Uint8Array, at: number): Uint8Array {
  const out = b.slice();
  const v = leToBig(out.subarray(at, at + 32)) + Q;
  if (v >= 1n << 256n) return out; // Does not fit: left unchanged, callers check.
  bigToLe(v, out.subarray(at, at + 32));
  return out;
}
const changed = (a: Uint8Array, b: Uint8Array) => sha256Hex(a) !== sha256Hex(b);

const timed = <T>(fn: () => T): [T, number] => {
  const t = performance.now();
  const v = fn();
  return [v, performance.now() - t];
};

const shield2 = () => caseOf("shield", 2);
const deltaAt = (c: Case) => sectionOf(c, 2).start + c.layout.deltaFrom;

/** The file with entry `i`'s parameters replaced by `params` (section 10 resized). */
function withParams(c: Case, i: number, params: number[]): Uint8Array {
  return editSection(c.bytes, 10, (d) => {
    const off = mpcEntryOffsets(d, i);
    const out = new Uint8Array(d.length - (off.end - off.params) + params.length);
    out.set(d.subarray(0, off.paramsLength));
    setU32(out, off.paramsLength, params.length);
    out.set(params, off.params);
    out.set(d.subarray(off.end), off.params + params.length);
    return out;
  });
}
const nameParam = (name: number[]) => [1, name.length, ...name];
const ascii = (s: string) => [...new TextEncoder().encode(s)];

/**
 * Ranges where an `ok` pre-check is legitimate: δ2, sections 3–9 data, and the new entry's public
 * key, transcript and name (the attacker claims the recomputed h_k).
 */
function zkviRanges(c: Case): Array<[number, number]> {
  const l = layoutOf(c.bytes);
  const g = l.find((s) => s.type === 2)!;
  const mpc = l.find((s) => s.type === 10)!;
  const off = mpcEntryOffsets(c.bytes.subarray(mpc.start, mpc.end), c.k - 1);
  return [
    [g.start + c.layout.deltaFrom + 64, g.start + c.layout.deltaTo],
    ...l.filter((s) => s.type >= 3 && s.type <= 9).map((s): [number, number] => [s.start, s.end]),
    [mpc.start + off.entry + 64, mpc.start + off.type],
    [mpc.start + off.params + 2, mpc.start + off.end],
  ];
}

/** Random flips per key: [circuit, k, default count, exhaustive count, seed]. */
const FLIPS = [
  ["shield", 2, 300, 6000, 0x5eed1],
  ["shield", 3, 150, 3000, 0x5eed2],
  ["shield", 1, 100, 2000, 0x5eed3],
  ["unshield", 2, 10, 300, 0x5eed4],
  ["transfer", 3, 4, 150, 0x5eed5],
] as const;

describe.skipIf(!existsSync(DIR))("pre-check on the rehearsal keys", { timeout: 600_000 }, () => {
  it.each(ALL_KEYS)("accepts the honest %s #%i", (circuit, k) => {
    const c = caseOf(circuit, k);
    expect(run(c, c.bytes)).toEqual({ ok: true });
  });

  it.each(EXHAUSTIVE ? ALL_KEYS : SAMPLE_KEYS)(
    "rejects %s #%i truncated at every section boundary and mid-section",
    (circuit, k) => {
      const c = caseOf(circuit, k);
      const cuts = new Set<number>([0, 1, 4, 8, 11, 12]);
      for (const s of layoutOf(c.bytes)) {
        for (const at of [s.header, s.header + 4, s.header + 11, s.start, s.start + 1])
          cuts.add(at);
        for (const at of [(s.start + s.end) >> 1, s.end - 1, s.end - 32, s.end - 64]) cuts.add(at);
      }
      const inside = [...cuts].filter((at) => at >= 0 && at < c.bytes.length);
      expect(
        escaped(inside.map((at) => verdict(run(c, c.bytes.subarray(0, at)), `cut at ${at}`))),
      ).toEqual([]);
    },
  );

  it.each(EXHAUSTIVE ? SAMPLE_KEYS : SAMPLE_KEYS.filter(([c]) => c === "shield"))(
    "rejects %s #%i with any bit flipped in the file header or a section-table entry",
    (circuit, k) => {
      const c = caseOf(circuit, k);
      const fields = Array.from({ length: 12 }, (_, i) => i);
      for (const s of layoutOf(c.bytes)) for (let i = 0; i < 12; i++) fields.push(s.header + i);
      // Large keys: bits 0, 3 and 6 only.
      const bits = circuit === "shield" ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 3, 6];
      const verdicts = fields.flatMap((at) =>
        bits.map((bit) => {
          const m = c.bytes.slice();
          m[at] = (m[at] as number) ^ (1 << bit);
          return verdict(run(c, m), `bit ${bit} of byte ${at}`);
        }),
      );
      expect(escaped(verdicts)).toEqual([]);
    },
  );

  describe("container layout (shield #2)", () => {
    const c = shield2;
    const parts = () => splitBinfile(c().bytes);

    it.each([0, 2, 3, 0xffffffff])("rejects binfile version %i", (v) => {
      const p = parts();
      expect(verdict(run(c(), joinBinfile(p.magic, v, p.sections)), `version ${v}`)).toBe(REJECTED);
    });

    it.each([33, 1000, 0xffffffff])("rejects a declared count of %i sections in O(1)", (n) => {
      const m = c().bytes.slice();
      setU32(m, 8, n);
      const [o, ms] = timed(() => run(c(), m));
      expect(verdict(o, `count ${n}`)).toBe(REJECTED);
      expect(ms).toBeLessThan(200);
    });

    it("rejects 33 real sections (extra empty unknown sections)", () => {
      const p = parts();
      const extra = Array.from({ length: 23 }, () => ({ type: 11, data: new Uint8Array() }));
      const m = joinBinfile(p.magic, p.version, [...p.sections, ...extra]);
      expect(verdict(run(c(), m), "33 sections")).toBe(REJECTED);
    });

    it("rejects a repeated section", () => {
      const p = parts();
      const dup = [...p.sections.slice(0, 3), p.sections[2]!, ...p.sections.slice(3)];
      expect(verdict(run(c(), joinBinfile(p.magic, p.version, dup)), "dup")).toBe(REJECTED);
    });

    it("rejects sections out of order (the genesis order 1,2,4,3,9,8,5,6,7,10)", () => {
      const p = parts();
      const by = (t: number) => p.sections.find((s) => s.type === t)!;
      const order = [1, 2, 4, 3, 9, 8, 5, 6, 7, 10].map(by);
      expect(verdict(run(c(), joinBinfile(p.magic, p.version, order)), "order")).toBe(REJECTED);
    });

    it.each([1, 32, 4096])("rejects %i trailing bytes", (n) => {
      const m = new Uint8Array(c().bytes.length + n);
      m.set(c().bytes);
      expect(verdict(run(c(), m), `trailing ${n}`)).toBe(REJECTED);
    });

    it("rejects a trailing empty section 11", () => {
      const p = parts();
      const m = joinBinfile(p.magic, p.version, [
        ...p.sections,
        { type: 11, data: new Uint8Array() },
      ]);
      expect(verdict(run(c(), m), "s11")).toBe(REJECTED);
    });

    it.each([
      ["2^53", 1n << 53n],
      ["2^53 - 1", (1n << 53n) - 1n],
      ["2^40", 1n << 40n],
      ["2^64 - 1", (1n << 64n) - 1n],
      ["size + 1", -1n],
    ])("rejects an inflated size (%s) on every section before any allocation", (_, v) => {
      let worst = 0;
      const verdicts = layoutOf(c().bytes).map((s) => {
        const m = c().bytes.slice();
        setU64(m, s.header + 4, v === -1n ? BigInt(s.end - s.start + 1) : v);
        const [o, ms] = timed(() => run(c(), m));
        worst = Math.max(worst, ms);
        return verdict(o, `section ${s.type} size ${v}`);
      });
      expect(escaped(verdicts)).toEqual([]);
      expect(worst).toBeLessThan(500);
    });

    it.each([3, 4, 5, 6, 7, 8, 9])(
      "rejects section %i grown by one point in a consistent container",
      (t) => {
        const m = editSection(c().bytes, t, (d) => {
          const out = new Uint8Array(d.length + 64);
          out.set(d);
          return out;
        });
        expect(verdict(run(c(), m), `grow ${t}`)).toBe(REJECTED);
      },
    );

    it.each([
      ["n8q", 0, 64],
      ["n8q", 0, 0x7fffffff],
      ["n8r", 36, 64],
      ["nVars", 72, 0xffffffff],
      ["nPublic", 76, 0xffffffff],
      ["domainSize", 80, 1 << 30],
    ])("rejects Groth16 header %s = %i before snarkjs allocates", (_, at, v) => {
      const m = editSection(c().bytes, 2, (d) => {
        setU32(d, at, v);
        return d;
      });
      expect(verdict(run(c(), m), `header ${at}`)).toBe(REJECTED);
    });

    it("rejects a section 2 grown to match an altered n8q", () => {
      const m = editSection(c().bytes, 2, (d) => {
        const out = new Uint8Array(d.length + 32);
        out.set(d);
        setU32(out, 0, 64);
        return out;
      });
      expect(verdict(run(c(), m), "n8q 64")).toBe(REJECTED);
    });

    it("rejects the protocol id (section 1) set to PLONK", () => {
      const m = editSection(c().bytes, 1, (d) => {
        setU32(d, 0, 2);
        return d;
      });
      expect(verdict(run(c(), m), "plonk")).toBe(REJECTED);
    });
  });

  describe("non-canonical elements and points (each circuit, k = 2)", () => {
    it.each(CIRCUITS)("%s: rejects every δ1/δ2 limb written as limb + q", (circuit) => {
      const c = caseOf(circuit, 2);
      const at = deltaAt(c);
      const mutants = Array.from({ length: 6 }, (_, limb) => plusQ(c.bytes, at + 32 * limb));
      expect(mutants.every((m) => changed(m, c.bytes))).toBe(true);
      expect(escaped(mutants.map((m, limb) => verdict(run(c, m), `δ limb ${limb}`)))).toEqual([]);
    });

    it.each(CIRCUITS)("%s: rejects δ1 or δ2 at infinity (all zero)", (circuit) => {
      const c = caseOf(circuit, 2);
      const at = deltaAt(c);
      const verdicts = [
        [at, 64],
        [at + 64, 128],
      ].map(([from, len]) => {
        const m = c.bytes.slice();
        m.fill(0, from, from! + len!);
        return verdict(run(c, m), `δ zero at ${from}`);
      });
      expect(escaped(verdicts)).toEqual([]);
    });

    it.each(CIRCUITS)(
      "%s: rejects the first, middle and last L and H elements as x + q",
      (circuit) => {
        const c = caseOf(circuit, 2);
        const verdicts = [8, 9].flatMap((t) => {
          const s = sectionOf(c, t);
          const n = (s.end - s.start) / 32;
          return [0, 1, n >> 1, n - 2, n - 1]
            .map((i) => [i, plusQ(c.bytes, s.start + 32 * i)] as const)
            .filter(([, m]) => changed(m, c.bytes)) // Elements too large to add q are skipped.
            .map(([i, m]) => verdict(run(c, m), `section ${t} elem ${i}`));
        });
        expect(verdicts.length).toBeGreaterThan(0);
        expect(escaped(verdicts)).toEqual([]);
      },
    );

    it.each(CIRCUITS)(
      "%s: rejects every limb of every point of the new MPC entry as x + q",
      (circuit) => {
        const c = caseOf(circuit, 2);
        const mpc = sectionOf(c, 10);
        const off = mpcEntryOffsets(c.bytes.subarray(mpc.start, mpc.end), 1);
        const verdicts = Array.from({ length: 2 + 2 + 2 + 4 }, (_, limb) => limb)
          .map((limb) => [limb, plusQ(c.bytes, mpc.start + off.entry + 32 * limb)] as const)
          .filter(([, m]) => changed(m, c.bytes))
          .map(([limb, m]) => verdict(run(c, m), `entry limb ${limb}`));
        expect(verdicts.length).toBeGreaterThan(0);
        expect(escaped(verdicts)).toEqual([]);
      },
    );

    it.each(CIRCUITS)("%s: rejects each point of the new MPC entry at infinity", (circuit) => {
      const c = caseOf(circuit, 2);
      const mpc = sectionOf(c, 10);
      const off = mpcEntryOffsets(c.bytes.subarray(mpc.start, mpc.end), 1);
      const verdicts = [
        [0, 64],
        [64, 64],
        [128, 64],
        [192, 128],
      ].map(([from, len]) => {
        const m = c.bytes.slice();
        const at = mpc.start + off.entry + from!;
        m.fill(0, at, at + len!);
        return verdict(run(c, m), `entry zero at ${from}`);
      });
      expect(escaped(verdicts)).toEqual([]);
    });
  });

  describe("protocol (pre-check only)", () => {
    it.each([
      ["empty", []],
      ["65 chars", ascii("a".repeat(65))],
      ["control char", ascii("ab\u0007c")],
      ["DEL", [0x61, 0x7f]],
      ["non-ASCII", ascii("café")],
      ["invalid UTF-8", [0xc3, 0x28]],
      ["NUL", [0x61, 0x00]],
    ])("rejects a new entry named %s", (what, name) => {
      const c = caseOf("shield", 2);
      const m = withParams(c, 1, name.length > 0 ? nameParam(name) : []);
      expect(verdict(run(c, m), what)).toBe(REJECTED);
    });

    it("accepts a new entry named with exactly 64 printable characters", () => {
      const c = caseOf("shield", 2);
      expect(run(c, withParams(c, 1, nameParam(ascii("~".repeat(64)))))).toEqual({ ok: true });
    });

    it("rejects a new contribution entry carrying beacon parameters", () => {
      const c = caseOf("shield", 2);
      const p = [...nameParam(ascii("x")), 2, 10, 3, 32, ...Array(32).fill(0xab)];
      expect(verdict(run(c, withParams(c, 1, p)), "beacon params")).toBe(REJECTED);
    });

    it("rejects a new entry of beacon or unknown type", () => {
      const c = caseOf("shield", 2);
      const verdicts = [1, 2, 0xffffffff].map((type) => {
        const m = editSection(c.bytes, 10, (d) => {
          setU32(d, mpcEntryOffsets(d, 1).type, type);
          return d;
        });
        return verdict(run(c, m), `type ${type}`);
      });
      expect(escaped(verdicts)).toEqual([]);
    });

    it("rejects an earlier entry renamed, unnamed or retyped", () => {
      const c = caseOf("shield", 3);
      const retyped = editSection(c.bytes, 10, (d) => {
        setU32(d, mpcEntryOffsets(d, 0).type, 1);
        return d;
      });
      expect(
        escaped([
          verdict(run(c, withParams(c, 0, nameParam(ascii("local-X")))), "rename #1"),
          verdict(run(c, withParams(c, 1, [])), "unname #2"),
          verdict(run(c, retyped), "retype #1"),
        ]),
      ).toEqual([]);
    });

    // Tags 2/3 are outside h_k and snarkjs ignores them on a contribution entry.
    it("rejects an earlier contribution entry carrying beacon parameters", () => {
      const c = caseOf("shield", 3);
      const tag2 = [...nameParam(ascii("local-1")), 2, 10];
      const tag3 = [...nameParam(ascii("local-1")), 3, 0];
      expect(
        escaped([
          verdict(run(c, withParams(c, 0, tag2)), "tag 2 on recorded #1"),
          verdict(run(c, withParams(c, 0, tag3)), "tag 3 on recorded #1"),
        ]),
      ).toEqual([]);
    });

    it("rejects an entry count other than k (one more, one less)", () => {
      const c = caseOf("shield", 3);
      const shorter = { ...c, head: { ...c.head, previous: c.head.previous.slice(0, 1) } };
      const longer = {
        ...c,
        head: { ...c.head, previous: [...c.head.previous, c.head.previous[0]!] },
      };
      expect(
        escaped([
          verdict(run(shorter, c.bytes), "one entry more than k"),
          verdict(run(longer, c.bytes), "one entry less than k"),
        ]),
      ).toEqual([]);
    });

    it("rejects a key of another circuit (unshield #1 uploaded as shield #1)", () => {
      const c = caseOf("shield", 1);
      expect(verdict(run(c, caseOf("unshield", 1).bytes), "cross-circuit")).toBe(REJECTED);
    });

    it("rejects a csHash of another circuit patched into the bytes", () => {
      const c = caseOf("shield", 2);
      const other = readMpcParams(caseOf("unshield", 2).bytes).csHash;
      const m = editSection(c.bytes, 10, (d) => {
        d.set(Uint8Array.from(Buffer.from(other, "hex")), 0);
        return d;
      });
      expect(verdict(run(c, m), "csHash")).toBe(REJECTED);
    });

    it("rejects a stale input_sha256, a wrong output hash and a wrong or malformed h_k", () => {
      const c = caseOf("shield", 2);
      const claim = {
        inputSha256: c.head.outputSha256,
        outputSha256: sha256Hex(c.bytes),
        contributionHash: c.hash,
      };
      const r = (cl: typeof claim) => precheckUpload(c.bytes, cl, c.head, c.layout);
      expect(r({ ...claim, inputSha256: "00".repeat(32) })).toMatchObject({ reason: "stale-head" });
      expect(r({ ...claim, outputSha256: "00".repeat(32) })).toMatchObject({
        reason: "output-hash-mismatch",
      });
      expect(r({ ...claim, contributionHash: "00".repeat(64) })).toMatchObject({
        reason: "client-hash-mismatch",
      });
      expect(r({ ...claim, contributionHash: c.hash.slice(0, 126) })).toMatchObject({
        reason: "malformed-claim",
      });
      expect(r({ ...claim, contributionHash: `0x${c.hash.slice(2)}` })).toMatchObject({
        reason: "malformed-claim",
      });
      expect(r({ ...claim, outputSha256: ` ${claim.outputSha256.slice(1)}` })).toMatchObject({
        reason: "malformed-claim",
      });
    });

    it("rejects a valid contribution on another chain of the same r1cs (KL-6)", () => {
      const c = caseOf("shield", 2);
      const forged = { ...c.head, previous: [{ ...c.head.previous[0]!, hash: "11".repeat(64) }] };
      expect(verdict(run({ ...c, head: forged }, c.bytes), "other chain")).toBe(REJECTED);
    });

    it("rejects δ equal to the genesis δ or to a recorded δ as a no-op contribution", () => {
      const c = caseOf("shield", 3);
      const first = caseOf("shield", 1);
      const g = sectionOf(c, 2);
      const mpc = sectionOf(c, 10);
      const firstMpc = sectionOf(first, 10);
      const firstOff = mpcEntryOffsets(first.bytes.subarray(firstMpc.start), 0);
      const recorded1 = first.bytes.slice(
        firstMpc.start + firstOff.entry,
        firstMpc.start + firstOff.entry + 64,
      );
      const genesisDelta = first.layout.groth16.slice(
        first.layout.deltaFrom,
        first.layout.deltaFrom + 64,
      );
      for (const d of [genesisDelta, recorded1]) {
        const m = c.bytes.slice();
        const off = mpcEntryOffsets(m.subarray(mpc.start, mpc.end), 2);
        m.set(d, mpc.start + off.deltaAfter);
        m.set(d, g.start + c.layout.deltaFrom);
        expect(run(c, m)).toMatchObject({ ok: false, reason: "noop-contribution" });
      }
    });
  });

  it.each(
    FLIPS.map(
      ([circuit, k, fast, full, seed]) => [circuit, k, EXHAUSTIVE ? full : fast, seed] as const,
    ),
  )(
    "%s #%i: %i random byte flips never throw and pass only where zkvi decides",
    (circuit, k, n, seed) => {
      const c = caseOf(circuit, k);
      const ranges = zkviRanges(c);
      const rand = mulberry32(seed);
      const reasons = new Map<string, number>();
      const bad: string[] = [];
      // Two thirds of the flips aim at the first 1 KiB and the MPC section, where the structure is.
      const mpc = sectionOf(c, 10);
      for (let i = 0; i < n; i++) {
        const m = c.bytes.slice();
        const zone = pick(rand, 3);
        const at =
          zone === 0
            ? pick(rand, Math.min(1024, m.length))
            : zone === 1
              ? mpc.header + pick(rand, mpc.end - mpc.header)
              : pick(rand, m.length);
        m[at] = (m[at] as number) ^ (1 + pick(rand, 255));
        const o = run(c, m);
        if ("threw" in o) {
          bad.push(`flip at ${at} threw: ${String(o.threw)}`);
          continue;
        }
        reasons.set(o.ok ? "ok" : o.reason, (reasons.get(o.ok ? "ok" : o.reason) ?? 0) + 1);
        if (o.ok && !ranges.some(([a, b]) => at >= a && at < b)) {
          bad.push(`flip at ${at} passed outside the content zkvi checks`);
        }
      }
      expect(bad).toEqual([]);
      // A small sample may miss the structure; a large one must hit it.
      expect(n < 50 || (reasons.get("malformed") ?? 0) > 0).toBe(true);
    },
  );

  // KL-17/KL-33: the pre-check only hashes earlier entries, so it stays cheap at the maximum.
  it("pre-checks a transfer key carrying 10,000 entries in bounded time", () => {
    const c = caseOf("transfer", 1);
    const mpc = sectionOf(c, 10);
    const section = c.bytes.subarray(mpc.start, mpc.end);
    const off = mpcEntryOffsets(section, 0);
    const entry = section.subarray(off.entry, off.end);
    const N = 10_000;
    const big = editSection(c.bytes, 10, (d) => {
      const out = new Uint8Array(68 + N * entry.length);
      out.set(d.subarray(0, 64));
      setU32(out, 64, N);
      for (let i = 0; i < N; i++) out.set(entry, 68 + i * entry.length);
      return out;
    });
    const parsed = readMpcParams(big).entries;
    const head: CurrentHead = {
      ...c.head,
      previous: parsed
        .slice(0, N - 1)
        .map((e) => ({ hash: e.hash, name: e.name ?? "", deltaAfter: "x" })),
    };
    const [o, ms] = timed(() => run({ ...c, head }, big, parsed.at(-1)!.hash));
    expect("threw" in o).toBe(false);
    expect(ms).toBeLessThan(30_000);
  });
});
