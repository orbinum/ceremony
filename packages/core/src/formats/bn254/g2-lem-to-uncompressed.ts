/**
 * A G2 affine point as snarkjs stores it (2 × Fq2 Montgomery LE, 128 B, each Fq2 stored c0‖c1) to
 * uncompressed big-endian with each Fq2 as c1‖c0 (x.c1, x.c0, y.c1, y.c0), which is how snarkjs
 * hashes it (checked against `zkey verify` in the tests). Infinity and points off the twist are
 * refused; the subgroup is `checkG2Subgroup`'s, since it costs ~2 ms.
 */
import { FormatError } from "../../primitives/errors";
import { FQ_BYTES } from "./constants";
import { fqLemToBe } from "./fq-lem-to-be";
import { g2Coordinates } from "./g2-coordinates";
import { limbOf } from "./limb-of";

export function g2LemToUncompressed(lem: Uint8Array): Uint8Array {
  if (lem.length !== 4 * FQ_BYTES) throw new FormatError("bad G2 size");
  if (lem.every((b) => b === 0)) throw new FormatError("G2 point at infinity");
  g2Coordinates(lem);
  const out = new Uint8Array(4 * FQ_BYTES);
  fqLemToBe(limbOf(lem, 1), out, 0);
  fqLemToBe(limbOf(lem, 0), out, FQ_BYTES);
  fqLemToBe(limbOf(lem, 3), out, 2 * FQ_BYTES);
  fqLemToBe(limbOf(lem, 2), out, 3 * FQ_BYTES);
  return out;
}
