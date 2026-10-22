/** BN254 points as snarkjs stores them (Montgomery LE) and hashes them (uncompressed BE). */
import { FormatError } from "../../primitives/errors";
import { FQ_BYTES, fqLemToBe } from "./field";

/** δ·G1 of every genesis: `groth16 setup` starts δ at 1, i.e. the G1 generator (1, 2). */
export const G1_GENERATOR = `${"00".repeat(31)}01${"00".repeat(31)}02`;

/** G1 affine point, 2 × Fq LEM (64 B) → uncompressed big-endian x‖y. Infinity is refused. */
export function g1LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 2 * FQ_BYTES) throw new FormatError("bad G1 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G1 point at infinity");
  const out = new Uint8Array(2 * FQ_BYTES);
  fqLemToBe(lem.subarray(0, FQ_BYTES), out, 0);
  fqLemToBe(lem.subarray(FQ_BYTES), out, FQ_BYTES);
  return out;
}

/**
 * G2 affine point, 2 × Fq2 LEM (128 B, each Fq2 stored c0‖c1) → uncompressed big-endian, each Fq2
 * as c1‖c0, which is how snarkjs hashes it (checked against `zkey verify` in the tests).
 */
export function g2LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 4 * FQ_BYTES) throw new FormatError("bad G2 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G2 point at infinity");
  const out = new Uint8Array(4 * FQ_BYTES);
  const limb = (i: number) => lem.subarray(i * FQ_BYTES, (i + 1) * FQ_BYTES);
  fqLemToBe(limb(1), out, 0); // x.c1
  fqLemToBe(limb(0), out, FQ_BYTES); // x.c0
  fqLemToBe(limb(3), out, 2 * FQ_BYTES); // y.c1
  fqLemToBe(limb(2), out, 3 * FQ_BYTES); // y.c0
  return out;
}
