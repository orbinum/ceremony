/**
 * Hostile uploads through the whole pipeline (pre-check + snarkjs zkvi in a bounded child) on the
 * testnet-rehearsal-2 keys (the finished rehearsal from fetch-test-inputs.sh, or the local one);
 * chosen-secret contributions carry valid proofs of knowledge, built exactly as `zkey contribute`
 * would and with self-contained binfile surgery. Never `valid` unless a genuine extension, never
 * `infra` for a crafted file (infra pauses the ceremony). Off-curve and small-order points are
 * refused by core's point checks before zkvi; beacon parameters lie outside h_k and zkvi ignores
 * them on a contribution entry, so the parser must refuse them. Seeded flips hit only the ranges
 * zkvi alone judges. `ORBINUM_EXHAUSTIVE=1` runs every baseline key, 40 seeded flips and a
 * 400-entry chain (~2 min).
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type CurrentHead,
  createBlake2b512,
  fromHex,
  genesisLayoutOf,
  readMpcParams,
  sha256Hex,
} from "@orbinum-ceremony/core";
import * as snarkjs from "snarkjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyBeacon, verifyUpload } from "../../src";
import { PTAU_PATH } from "../support";

const DIR =
  process.env.ORBINUM_REHEARSAL_DIR ??
  join(import.meta.dirname, "..", "..", "..", "..", "artifacts", "testnet-rehearsal-2");
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const EXHAUSTIVE = process.env.ORBINUM_EXHAUSTIVE === "1";
const BASELINE_KEYS = EXHAUSTIVE ? [1, 2, 3] : [1];
const FLIPS = EXHAUSTIVE ? 40 : 6;
const CHAIN_N = EXHAUSTIVE ? 400 : 16;

interface Sec {
  type: number;
  data: Uint8Array;
}
function split(bytes: Uint8Array): { version: number; sections: Sec[] } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Sec[] = [];
  let pos = 12;
  for (let i = 0; i < v.getUint32(8, true); i++) {
    const size = Number(v.getBigUint64(pos + 4, true));
    out.push({ type: v.getUint32(pos, true), data: bytes.slice(pos + 12, pos + 12 + size) });
    pos += 12 + size;
  }
  return { version: v.getUint32(4, true), sections: out };
}
function join2(version: number, sections: Sec[]): Uint8Array {
  const out = new Uint8Array(12 + sections.reduce((n, s) => n + 12 + s.data.length, 0));
  const v = new DataView(out.buffer);
  out.set([0x7a, 0x6b, 0x65, 0x79]);
  v.setUint32(4, version, true);
  v.setUint32(8, sections.length, true);
  let pos = 12;
  for (const s of sections) {
    v.setUint32(pos, s.type, true);
    v.setBigUint64(pos + 4, BigInt(s.data.length), true);
    out.set(s.data, pos + 12);
    pos += 12 + s.data.length;
  }
  return out;
}
const sec = (f: { sections: Sec[] }, t: number) => f.sections.find((s) => s.type === t)!;
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);
const setU32 = (b: Uint8Array, at: number, x: number) =>
  new DataView(b.buffer, b.byteOffset).setUint32(at, x, true);

function entryRanges(mpc: Uint8Array): Array<[number, number]> {
  const n = u32(mpc, 64);
  const out: Array<[number, number]> = [];
  let pos = 68;
  for (let i = 0; i < n; i++) {
    const end = pos + 392 + u32(mpc, pos + 388);
    out.push([pos, end]);
    pos = end;
  }
  return out;
}

type Curve = Record<string, any> & { terminate(): Promise<void> };
const { curves } = snarkjs as unknown as {
  curves: { getCurveFromName(name: string): Promise<Curve> };
};
let curve: Curve;
let hashToG2: (c: unknown, h: Uint8Array) => Uint8Array;

interface Tweak {
  delta2Add?: Uint8Array;
  g2spxAdd?: Uint8Array;
  g1sOffCurve?: boolean;
}

async function extend(
  input: Uint8Array,
  layout: ReturnType<typeof genesisLayoutOf>,
  secrets: bigint[],
  names: string[],
  tweak: Tweak = {},
): Promise<{ bytes: Uint8Array; hash: string }> {
  const { G1, G2, Fr } = curve;
  const f = split(input);
  const g16 = sec(f, 2).data.slice();
  const mpc = sec(f, 10).data;
  const csHash = mpc.subarray(0, 64);
  const unc1 = (p: Uint8Array) => {
    const b = new Uint8Array(64);
    G1.toRprUncompressed(b, 0, p);
    return b;
  };
  const unc2 = (p: Uint8Array) => {
    const b = new Uint8Array(128);
    G2.toRprUncompressed(b, 0, p);
    return b;
  };
  const prev = entryRanges(mpc).map(([a, b]) => mpc.slice(a, b));
  const pubs = new WeakMap<Uint8Array, Uint8Array>();
  const pubOf = (e: Uint8Array) => {
    let p = pubs.get(e);
    if (!p) {
      p = new Uint8Array(384);
      p.set(unc1(e.subarray(0, 64)), 0);
      p.set(unc1(e.subarray(64, 128)), 64);
      p.set(unc1(e.subarray(128, 192)), 128);
      p.set(unc2(e.subarray(192, 320)), 192);
      p.set(e.subarray(320, 384), 320);
      pubs.set(e, p);
    }
    return p;
  };
  let d1 = G1.fromRprLEM(g16, layout.deltaFrom);
  let d2 = G2.fromRprLEM(g16, layout.deltaFrom + 64);
  let total = Fr.one;
  const added: Uint8Array[] = [];
  secrets.forEach((x, i) => {
    const xe = Fr.e(((x % R) + R) % R);
    total = Fr.mul(total, xe);
    const s = Fr.e(0x1234567n + BigInt(i) * 7919n + BigInt(prev.length));
    const last = i === secrets.length - 1;
    const g1s = G1.toAffine(G1.timesFr(G1.g, s));
    if (tweak.g1sOffCurve && last) g1s[32] = (g1s[32]! ^ 1) as number;
    const g1sx = tweak.g1sOffCurve && last ? G1.neg(g1s) : G1.toAffine(G1.timesFr(g1s, xe));
    const t = createBlake2b512();
    t.update(csHash);
    for (const e of [...prev, ...added]) t.update(pubOf(e));
    t.update(unc1(g1s)).update(unc1(g1sx));
    const transcript = fromHex(t.digestHex());
    const g2sp = hashToG2(curve, transcript);
    let g2spx = tweak.g1sOffCurve && last ? G2.neg(g2sp) : G2.toAffine(G2.timesFr(g2sp, xe));
    if (tweak.g2spxAdd && i === secrets.length - 1)
      g2spx = G2.toAffine(G2.add(g2spx, tweak.g2spxAdd));
    d1 = G1.toAffine(G1.timesFr(d1, xe));
    d2 = G2.toAffine(G2.timesFr(d2, xe));
    const name = new TextEncoder().encode(names[i] ?? `c${i}`);
    const e = new Uint8Array(392 + 2 + name.length);
    G1.toRprLEM(e, 0, d1);
    G1.toRprLEM(e, 64, g1s);
    G1.toRprLEM(e, 128, g1sx);
    G2.toRprLEM(e, 192, g2spx);
    e.set(transcript, 320);
    setU32(e, 384, 0);
    setU32(e, 388, 2 + name.length);
    e.set([1, name.length, ...name], 392);
    added.push(e);
  });
  if (tweak.delta2Add) d2 = G2.toAffine(G2.add(d2, tweak.delta2Add));
  G1.toRprLEM(g16, layout.deltaFrom, d1);
  G2.toRprLEM(g16, layout.deltaFrom + 64, d2);
  const inv = Fr.inv(total);
  const newMpc = new Uint8Array(mpc.length + added.reduce((n, e) => n + e.length, 0));
  newMpc.set(mpc);
  setU32(newMpc, 64, prev.length + added.length);
  let pos = mpc.length;
  for (const e of added) {
    newMpc.set(e, pos);
    pos += e.length;
  }
  const scaled = async (t: number) =>
    new Uint8Array(await G1.batchApplyKey(sec(f, t).data, inv, Fr.one));
  const out = f.sections.map((s) => ({ ...s }));
  sec({ sections: out }, 2).data = g16;
  sec({ sections: out }, 8).data = await scaled(8);
  sec({ sections: out }, 9).data = await scaled(9);
  sec({ sections: out }, 10).data = newMpc;
  const bytes = join2(
    f.version,
    out.toSorted((x, y) => x.type - y.type),
  );
  return { bytes, hash: lastHash(bytes) };
}

function lastHash(bytes: Uint8Array): string {
  const { G1, G2 } = curve;
  const mpc = sec(split(bytes), 10).data;
  const [a, b] = entryRanges(mpc).at(-1)!;
  const e = mpc.subarray(a, b);
  const unc = (g: typeof G1, p: Uint8Array, n: number) => {
    const out = new Uint8Array(n);
    g.toRprUncompressed(out, 0, p);
    return out;
  };
  const t = createBlake2b512();
  for (const at of [0, 64, 128]) t.update(unc(G1, e.subarray(at, at + 64), 64));
  t.update(unc(G2, e.subarray(192, 320), 128)).update(e.subarray(320, 384));
  return t.digestHex();
}

function torsionG2(): Uint8Array {
  const { G2 } = curve;
  const F2 = G2.F;
  const h2 = 2n * Q - R;
  for (let i = 1n; i < 500n; i++) {
    const x = F2.fromObject([i, 1n]);
    const y2 = F2.add(F2.mul(F2.square(x), x), G2.b);
    if (!F2.isSquare(y2)) continue;
    const p = G2.fromObject([F2.toObject(x), F2.toObject(F2.sqrt(y2)), [1n, 0n]]);
    const t = G2.timesScalar(p, (R * h2) / 10069n);
    if (!G2.isZero(t)) return G2.toAffine(t);
  }
  throw new Error("no torsion point");
}

const ready = !!PTAU_PATH && existsSync(DIR);
const CIRCUITS = ["shield", "unshield", "transfer"];

const genesisPath = (c: string) => join(DIR, "genesis", `${c}.genesis.zkey`);
const keyPath = (c: string, k: number) =>
  k === 0 ? genesisPath(c) : join(DIR, "contributions", c, `${k}.zkey`);
const bytesOf = async (p: string) => new Uint8Array(await readFile(p));

function headOf(bytes: Uint8Array): CurrentHead {
  const p = readMpcParams(bytes);
  return {
    outputSha256: sha256Hex(bytes),
    csHash: p.csHash,
    previous: p.entries.map((e) => ({
      hash: e.hash,
      name: e.name ?? "",
      deltaAfter: e.deltaAfter,
    })),
  };
}

describe.skipIf(!ready)("hostile uploads through the pipeline", { timeout: 900_000 }, () => {
  const ptau = PTAU_PATH as string;
  let work: string;
  const layouts = new Map<string, ReturnType<typeof genesisLayoutOf>>();
  let n = 0;
  async function upload(circuit: string, head: CurrentHead, bytes: Uint8Array, hash: string) {
    const path = join(work, `u${n++}.zkey`);
    await writeFile(path, bytes);
    return verifyUpload(
      { zkey: path, genesis: genesisPath(circuit), ptau },
      { inputSha256: head.outputSha256, outputSha256: sha256Hex(bytes), contributionHash: hash },
      head,
    );
  }
  const verdictOf = async (circuit: string, head: CurrentHead, bytes: Uint8Array, hash: string) =>
    (await upload(circuit, head, bytes, hash)).verdict;
  const layout = (c: string) => layouts.get(c)!;

  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), "orbinum-hostile-"));
    curve = await curves.getCurveFromName("bn128");
    const pkg = dirname(dirname(createRequire(import.meta.url).resolve("snarkjs")));
    ({ hashToG2 } = await import(pathToFileURL(join(pkg, "src", "keypair.js")).href));
    const geneses = await Promise.all(CIRCUITS.map((c) => bytesOf(genesisPath(c))));
    CIRCUITS.forEach((c, i) => layouts.set(c, genesisLayoutOf(geneses[i]!)));
  });
  afterAll(async () => {
    await curve?.terminate();
  });

  it.each(CIRCUITS.flatMap((c) => BASELINE_KEYS.map((k) => [c, k] as const)))(
    "accepts the real %s #%i",
    async (circuit, k) => {
      const prev = await bytesOf(keyPath(circuit, k - 1));
      const bytes = await bytesOf(keyPath(circuit, k));
      const res = await upload(
        circuit,
        headOf(prev),
        bytes,
        readMpcParams(bytes).entries.at(-1)!.hash,
      );
      expect(res.verdict).toMatchObject({ result: "valid", index: k });
    },
  );

  describe("chosen-secret contributions on shield #3", () => {
    let three: Uint8Array;
    let head3: CurrentHead;
    beforeAll(async () => {
      three = await bytesOf(keyPath("shield", 3));
      head3 = headOf(three);
    });

    it("accepts a fresh chosen secret (so the attacks below carry valid proofs of knowledge)", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [0xdeadbeefn], ["c4"]);
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({
        result: "valid",
        index: 4,
      });
    });

    it("rejects a no-op (secret 1)", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [1n], ["noop"]);
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({
        result: "rejected",
        reason: "noop-contribution",
      });
    });

    it("rejects a cancelling chain (x accepted, then 1/x) at the second step", async () => {
      const x = 0xc0ffeen;
      const a = await extend(three, layout("shield"), [x], ["x"]);
      expect(await verdictOf("shield", head3, a.bytes, a.hash)).toMatchObject({ result: "valid" });
      const inv = BigInt(curve.Fr.toObject(curve.Fr.inv(curve.Fr.e(x))));
      const b = await extend(a.bytes, layout("shield"), [inv], ["1/x"]);
      expect(await verdictOf("shield", headOf(a.bytes), b.bytes, b.hash)).toMatchObject({
        result: "rejected",
        reason: "noop-contribution",
      });
    });

    it("accepts secret −1", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [R - 1n], ["minus-one"]);
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({ result: "valid" });
    });

    it("accepts a beacon entry retyped as a contribution, a public secret", async () => {
      const src = join(work, "beacon-src.zkey");
      await writeFile(src, three);
      const out = join(work, "beacon-out.zkey");
      await applyBeacon(src, out, "b", "ab".repeat(32), 10);
      const f = split(await bytesOf(out));
      const mpc = sec(f, 10).data;
      const [a, b] = entryRanges(mpc).at(-1)!;
      const e = mpc.slice(a, a + 392 + 3);
      setU32(e, 384, 0);
      setU32(e, 388, 3);
      e.set([1, 1, 0x62], 392);
      const m = new Uint8Array(a + e.length + (mpc.length - b));
      m.set(mpc.subarray(0, a));
      m.set(e, a);
      m.set(mpc.subarray(b), a + e.length);
      sec(f, 10).data = m;
      const bytes = join2(f.version, f.sections);
      const asBeacon = await bytesOf(out);
      expect(await verdictOf("shield", head3, asBeacon, lastHash(asBeacon))).toMatchObject({
        result: "rejected",
        reason: "not-a-contribution",
      });
      expect(await verdictOf("shield", head3, bytes, lastHash(bytes))).toMatchObject({
        result: "valid",
      });
    });

    it("rejects δ led back to the genesis δ by two chosen secrets (x, then 1/x)", async () => {
      const genesis = await bytesOf(genesisPath("shield"));
      const a = await extend(genesis, layout("shield"), [77n], ["a"]);
      expect(await verdictOf("shield", headOf(genesis), a.bytes, a.hash)).toMatchObject({
        result: "valid",
      });
      const inv = BigInt(curve.Fr.toObject(curve.Fr.inv(curve.Fr.e(77n))));
      const b = await extend(a.bytes, layout("shield"), [inv], ["b"]);
      expect(await verdictOf("shield", headOf(a.bytes), b.bytes, b.hash)).toMatchObject({
        result: "rejected",
        reason: "noop-contribution",
      });
    });

    it("rejects δ2 with a component of order 10069 (not in G2), never infra", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [99n], ["tors"], {
        delta2Add: torsionG2(),
      });
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    });

    it("rejects g2_spx with a component of order 10069 (not in G2), never infra", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [99n], ["tors"], {
        g2spxAdd: torsionG2(),
      });
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    });

    it("rejects an off-curve δ (header δ1 = entry δ, canonical limbs), never infra", async () => {
      const { bytes } = await extend(three, layout("shield"), [5n], ["off"]);
      const f = split(bytes);
      const g16 = sec(f, 2).data;
      const mpc = sec(f, 10).data;
      const [a] = entryRanges(mpc).at(-1)!;
      const y = g16.subarray(layout("shield").deltaFrom + 32, layout("shield").deltaFrom + 64);
      y[0] = (y[0]! ^ 1) as number;
      mpc.set(g16.subarray(layout("shield").deltaFrom, layout("shield").deltaFrom + 64), a);
      const m = join2(f.version, f.sections);
      expect(await verdictOf("shield", head3, m, lastHash(m))).toMatchObject({
        result: "rejected",
      });
    });

    it("rejects off-curve g1_s/g1_sx with secret −1, which zkvi's pairing alone accepts", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [R - 1n], ["offg1s"], {
        g1sOffCurve: true,
      });
      expect(await verdictOf("shield", head3, bytes, hash)).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    });

    it("rejects an off-curve L point (canonical), never infra", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [5n], ["offL"]);
      const f = split(bytes);
      const l = sec(f, 8).data;
      l[32] = (l[32]! ^ 1) as number;
      const m = join2(f.version, f.sections);
      expect(await verdictOf("shield", head3, m, hash)).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    });

    it("rejects an H point set to infinity, never infra", async () => {
      const { bytes, hash } = await extend(three, layout("shield"), [5n], ["infH"]);
      const f = split(bytes);
      sec(f, 9).data.fill(0, 64, 128);
      const m = join2(f.version, f.sections);
      expect(await verdictOf("shield", head3, m, hash)).toMatchObject({
        result: "rejected",
        reason: "zkey-verify-failed",
      });
    });

    it("rejects beacon parameters added to recorded entry #1 as malformed", async () => {
      const f = split(three);
      const mpc = sec(f, 10).data;
      const [a, b] = entryRanges(mpc)[0]!;
      const paramsLen = u32(mpc, a + 388);
      const m = new Uint8Array(mpc.length + 2);
      m.set(mpc.subarray(0, b));
      m.set([2, 10], b);
      m.set(mpc.subarray(b), b + 2);
      setU32(m, a + 388, paramsLen + 2);
      sec(f, 10).data = m;
      const bytes = join2(f.version, f.sections);
      expect(() => readMpcParams(bytes)).toThrow(
        /contribution entry with the wrong beacon parameters/,
      );
      const two = await bytesOf(keyPath("shield", 2));
      const hash = readMpcParams(three).entries.at(-1)!.hash;
      expect(await verdictOf("shield", headOf(two), bytes, hash)).toMatchObject({
        result: "rejected",
        reason: "malformed",
      });
    });
  });

  it("rejects unshield #1 uploaded as shield #1", async () => {
    const genesis = await bytesOf(genesisPath("shield"));
    const u = await bytesOf(keyPath("unshield", 1));
    expect(
      await verdictOf("shield", headOf(genesis), u, readMpcParams(u).entries[0]!.hash),
    ).toMatchObject({
      result: "rejected",
    });
  });

  it("rejects seeded flips in the ranges only zkvi judges, never valid nor infra (shield #2)", async () => {
    const prev = await bytesOf(keyPath("shield", 1));
    const two = await bytesOf(keyPath("shield", 2));
    const head = headOf(prev);
    const f = split(two);
    const offsets: Array<[number, number]> = [];
    let pos = 12;
    for (const s of f.sections) {
      const start = pos + 12;
      if (s.type === 2)
        offsets.push([start + layout("shield").deltaFrom + 64, start + layout("shield").deltaTo]);
      if (s.type >= 3 && s.type <= 9) offsets.push([start, start + s.data.length]);
      if (s.type === 10) {
        const [a] = entryRanges(s.data).at(-1)!;
        offsets.push([start + a + 64, start + a + 384]);
      }
      pos = start + s.data.length;
    }
    let seed = 0xa0d17;
    const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    const results: string[] = [];
    for (let i = 0; i < FLIPS; i++) {
      const [a, b] = offsets[Math.floor(rand() * offsets.length)]!;
      const at = a + Math.floor(rand() * (b - a));
      const m = two.slice();
      m[at] = (m[at]! ^ (1 + Math.floor(rand() * 255))) as number;
      let hash: string;
      try {
        hash = lastHash(m);
      } catch {
        continue;
      }
      const res = await upload("shield", head, m, hash);
      results.push(`${at}:${res.verdict.result}`);
    }
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => !r.endsWith(":rejected"))).toEqual([]);
  });

  it("reports a hit timeout bound as infra", async () => {
    const prev = await bytesOf(keyPath("shield", 2));
    const three = await bytesOf(keyPath("shield", 3));
    const path = join(work, "slow.zkey");
    await writeFile(path, three);
    const res = await verifyUpload(
      { zkey: path, genesis: genesisPath("shield"), ptau },
      {
        inputSha256: sha256Hex(prev),
        outputSha256: sha256Hex(three),
        contributionHash: readMpcParams(three).entries.at(-1)!.hash,
      },
      headOf(prev),
      { timeoutMs: 50 },
    );
    expect(res.verdict.result).toBe("infra");
  });

  it(`accepts the last upload of a long valid chain (${CHAIN_N} entries)`, async () => {
    const genesis = await bytesOf(genesisPath("shield"));
    const N = CHAIN_N;
    const secrets = Array.from({ length: N - 1 }, (_, i) => 1000n + BigInt(i));
    const a = await extend(
      genesis,
      layout("shield"),
      secrets,
      secrets.map((_, i) => `c${i + 1}`),
    );
    const b = await extend(a.bytes, layout("shield"), [424242n], ["last"]);
    const res = await upload("shield", headOf(a.bytes), b.bytes, b.hash);
    expect(res.verdict).toMatchObject({ result: "valid", index: N });
  });
});
