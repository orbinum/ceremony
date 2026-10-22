/** BN254 points as snarkjs stores them, in their only canonical spelling. SPEC §2.5 #3. */
import { describe, expect, it } from "vitest";
import {
  BN254_FQ,
  checkCanonicalFq,
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

const run = (...vs: bigint[]) => {
  const out = new Uint8Array(32 * vs.length);
  vs.forEach((v, i) => out.set(element(v), 32 * i));
  return out;
};

describe("canonical field elements", () => {
  it("refuses a coordinate equal to q, the smallest non-canonical spelling", () => {
    const point = new Uint8Array(64);
    point.set(element(BN254_FQ), 0);
    point.set(lem(2n), 32);
    expect(() => g1LemToUncompressed(point)).toThrow(/out of range/);
    point.set(element(BN254_FQ - 1n), 0);
    expect(() => g1LemToUncompressed(point)).not.toThrow();
  });

  it("scans a run of elements: q and above refused, q − 1 and zero accepted", () => {
    expect(() => checkCanonicalFq(run(0n, BN254_FQ - 1n, 1n), "s")).not.toThrow();
    expect(() => checkCanonicalFq(run(0n, BN254_FQ), "s")).toThrow(
      "s: field element out of range at 32",
    );
    expect(() => checkCanonicalFq(run(2n ** 256n - 1n), "s")).toThrow(/out of range at 0/);
    expect(() => checkCanonicalFq(new Uint8Array(33), "s")).toThrow(/not a sequence/);
  });
});
