/** BN254 points as snarkjs stores them, in their only canonical spelling. SPEC §2.5 #3. */
import { bn254 } from "@noble/curves/bn254.js";
import { describe, expect, it } from "vitest";
import {
  BN254_FQ,
  checkG2Subgroup,
  G1_GENERATOR,
  g1LemToUncompressed,
  g2LemToUncompressed,
} from "../../../src/formats/bn254";
import { bigToLe } from "../../support";

/** Montgomery form of `x`: x · 2^256 mod q, little-endian, as snarkjs stores it. */
const lem = (x: bigint) => {
  const out = new Uint8Array(32);
  bigToLe((x * 2n ** 256n) % BN254_FQ, out);
  return out;
};

/** Coordinates (each Fq, Fq2 as c0, c1) in Montgomery LE, concatenated. */
const lemPoint = (...coords: bigint[]) => {
  const out = new Uint8Array(32 * coords.length);
  coords.forEach((c, i) => out.set(lem(c), 32 * i));
  return out;
};

/** A G2 affine point (Fq2 coordinates) as snarkjs stores it. */
const lemG2 = (p: { x: { c0: bigint; c1: bigint }; y: { c0: bigint; c1: bigint } }) =>
  lemPoint(p.x.c0, p.x.c1, p.y.c0, p.y.c1);

/** A point on the G2 twist found by trying x = (k, 0): almost surely outside the r-subgroup. */
function torsionTwistPoint() {
  const { Fp2 } = bn254.fields;
  const b = bn254.G2.Point.CURVE().b;
  for (let k = 1n; ; k++) {
    const x = Fp2.create({ c0: k, c1: 0n });
    const rhs = Fp2.add(Fp2.mul(Fp2.sqr(x), x), b);
    try {
      const y = Fp2.sqrt(rhs);
      if (!bn254.G2.Point.fromAffine({ x, y }).isTorsionFree()) return { x, y };
    } catch {
      // not a square: next x
    }
  }
}

describe("BN254 point decoding", () => {
  it("decodes the G1 generator (1, 2) to the genesis δ", () => {
    const g = new Uint8Array(64);
    g.set(lem(1n), 0);
    g.set(lem(2n), 32);
    expect(Buffer.from(g1LemToUncompressed(g)).toString("hex")).toBe(G1_GENERATOR);
  });

  it("refuses a coordinate ≥ q, the point at infinity and the wrong sizes", () => {
    const big = new Uint8Array(64).fill(0xff);
    expect(() => g1LemToUncompressed(big)).toThrow(/out of range/);
    expect(() => g1LemToUncompressed(new Uint8Array(64))).toThrow(/infinity/);
    expect(() => g1LemToUncompressed(new Uint8Array(63))).toThrow(/bad G1 size/);
    expect(() => g2LemToUncompressed(new Uint8Array(128))).toThrow(/infinity/);
    expect(() => g2LemToUncompressed(new Uint8Array(64))).toThrow(/bad G2 size/);
  });
});

const element = (v: bigint) => {
  const out = new Uint8Array(32);
  bigToLe(v, out);
  return out;
};

describe("canonical field elements", () => {
  it("refuses a coordinate equal to q, the smallest non-canonical spelling", () => {
    const point = new Uint8Array(64);
    point.set(element(BN254_FQ), 0);
    point.set(lem(2n), 32);
    expect(() => g1LemToUncompressed(point)).toThrow(/out of range/);
    // q − 1 is a canonical spelling: what refuses it now is the curve, not the range.
    point.set(element(BN254_FQ - 1n), 0);
    expect(() => g1LemToUncompressed(point)).toThrow(/not on the curve/);
  });

  it("refuses points off their curve and G2 points outside the subgroup, keeps real ones", () => {
    // (1, 2) is the G1 generator; (1, 3) is canonical but off y² = x³ + 3.
    expect(() => g1LemToUncompressed(lemPoint(1n, 2n))).not.toThrow();
    expect(() => g1LemToUncompressed(lemPoint(1n, 3n))).toThrow(/not on the curve/);
    const g2 = bn254.G2.Point.BASE.toAffine();
    expect(() => g2LemToUncompressed(lemG2(g2))).not.toThrow();
    expect(() => checkG2Subgroup(lemG2(g2))).not.toThrow();
    const off = { x: g2.x, y: { c0: g2.y.c0, c1: (g2.y.c1 + 1n) % BN254_FQ } };
    expect(() => g2LemToUncompressed(lemG2(off))).toThrow(/not on the curve/);
    // A twist point outside the order-r subgroup: the generator plus a cofactor-torsion point.
    const twisted = torsionTwistPoint();
    expect(() => g2LemToUncompressed(lemG2(twisted))).not.toThrow();
    expect(() => checkG2Subgroup(lemG2(twisted))).toThrow(/outside the prime-order subgroup/);
  });
});
