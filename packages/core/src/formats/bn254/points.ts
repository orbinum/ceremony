/**
 * BN254 points as snarkjs stores them (Montgomery LE) and hashes them (uncompressed BE). Every
 * decoded point is on its curve: snarkjs reads points as raw bytes and judges them only by
 * pairings, which an off-curve G1 point can satisfy (a secret of -1 with g1_sx = -g1_s), while the
 * independent verifier refuses such a key. An accepted point that later breaks every key built on
 * it is refused here instead.
 */
import { bn254 } from "@noble/curves/bn254.js";
import { FormatError } from "../../primitives/errors";
import { BN254_FQ, FQ_BYTES, fqLemToBe, fqLemToBigInt } from "./field";

/** δ·G1 of every genesis: `groth16 setup` starts δ at 1, i.e. the G1 generator (1, 2). */
export const G1_GENERATOR = `${"00".repeat(31)}01${"00".repeat(31)}02`;

const { Fp2 } = bn254.fields;
/** b of the G2 twist, y² = x³ + 3/(9+u). */
const B2 = bn254.G2.Point.CURVE().b;

const limbOf = (lem: Uint8Array, i: number) => lem.subarray(i * FQ_BYTES, (i + 1) * FQ_BYTES);

/** G1's x and y, on y² = x³ + 3 (G1 has cofactor 1: on the curve is in the group). */
function g1Coordinates(lem: Uint8Array): [bigint, bigint] {
  const x = fqLemToBigInt(limbOf(lem, 0));
  const y = fqLemToBigInt(limbOf(lem, 1));
  if ((y * y - x * x * x - 3n) % BN254_FQ !== 0n)
    throw new FormatError("G1 point not on the curve");
  return [x, y];
}

/** G1 affine point, 2 × Fq LEM (64 B) → uncompressed big-endian x‖y. Infinity is refused. */
export function g1LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 2 * FQ_BYTES) throw new FormatError("bad G1 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G1 point at infinity");
  g1Coordinates(lem);
  const out = new Uint8Array(2 * FQ_BYTES);
  fqLemToBe(limbOf(lem, 0), out, 0);
  fqLemToBe(limbOf(lem, 1), out, FQ_BYTES);
  return out;
}

/**
 * Throws unless `bytes` is a sequence of G1 points (L, H), each canonical and on the curve or the
 * point at infinity (all zero). Linear in the size.
 */
export function checkG1Points(bytes: Uint8Array, what: string): void {
  const size = 2 * FQ_BYTES;
  if (bytes.length % size !== 0) throw new FormatError(`${what}: not a sequence of G1 points`);
  for (let at = 0; at < bytes.length; at += size) {
    const p = bytes.subarray(at, at + size);
    if (p.every((b) => b === 0)) continue;
    try {
      g1Coordinates(p);
    } catch (error) {
      throw new FormatError(`${what}: ${(error as Error).message} at ${at}`);
    }
  }
}

/** G2's x and y as Fq2 (each stored c0‖c1), on the twist. */
function g2Coordinates(lem: Uint8Array) {
  const x = Fp2.create({ c0: fqLemToBigInt(limbOf(lem, 0)), c1: fqLemToBigInt(limbOf(lem, 1)) });
  const y = Fp2.create({ c0: fqLemToBigInt(limbOf(lem, 2)), c1: fqLemToBigInt(limbOf(lem, 3)) });
  if (!Fp2.eql(Fp2.sqr(y), Fp2.add(Fp2.mul(Fp2.sqr(x), x), B2))) {
    throw new FormatError("G2 point not on the curve");
  }
  return { x, y };
}

/**
 * G2 affine point, 2 × Fq2 LEM (128 B, each Fq2 stored c0‖c1) → uncompressed big-endian, each Fq2
 * as c1‖c0, which is how snarkjs hashes it (checked against `zkey verify` in the tests). Infinity
 * and points off the twist are refused; the subgroup is `checkG2Subgroup`'s (it costs ~2 ms).
 */
export function g2LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 4 * FQ_BYTES) throw new FormatError("bad G2 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G2 point at infinity");
  g2Coordinates(lem);
  const out = new Uint8Array(4 * FQ_BYTES);
  fqLemToBe(limbOf(lem, 1), out, 0); // x.c1
  fqLemToBe(limbOf(lem, 0), out, FQ_BYTES); // x.c0
  fqLemToBe(limbOf(lem, 3), out, 2 * FQ_BYTES); // y.c1
  fqLemToBe(limbOf(lem, 2), out, 3 * FQ_BYTES); // y.c0
  return out;
}

/** Throws unless the G2 point (on the twist, as decoded above) is in the prime-order subgroup. */
export function checkG2Subgroup(lem: Uint8Array): void {
  const { x, y } = g2Coordinates(lem);
  if (!bn254.G2.Point.fromAffine({ x, y }).isTorsionFree()) {
    throw new FormatError("G2 point outside the prime-order subgroup");
  }
}
