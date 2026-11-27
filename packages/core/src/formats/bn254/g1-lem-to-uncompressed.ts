/**
 * A G1 affine point as snarkjs stores it (2 × Fq Montgomery LE, 64 B) to uncompressed big-endian
 * x‖y, as snarkjs hashes it. Infinity and points off the curve are refused.
 */
import { FormatError } from "../../primitives/errors";
import { FQ_BYTES } from "./constants";
import { fqLemToBe } from "./fq-lem-to-be";
import { g1Coordinates } from "./g1-coordinates";
import { limbOf } from "./limb-of";

export function g1LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 2 * FQ_BYTES) throw new FormatError("bad G1 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G1 point at infinity");
  g1Coordinates(lem);
  const out = new Uint8Array(2 * FQ_BYTES);
  fqLemToBe(limbOf(lem, 0), out, 0);
  fqLemToBe(limbOf(lem, 1), out, FQ_BYTES);
  return out;
}
