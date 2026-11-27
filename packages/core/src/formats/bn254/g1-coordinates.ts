/**
 * A stored G1 point's x and y, refused unless on y² = x³ + 3. G1 has cofactor 1, so on the curve
 * is in the group. snarkjs reads points as raw bytes and judges them only by pairings, which an
 * off-curve G1 point can satisfy (a secret of -1 with g1_sx = -g1_s) while the independent
 * verifier refuses such a key: an accepted point that would later break every key built on it is
 * refused here instead.
 */
import { FormatError } from "../../primitives/errors";
import { BN254_FQ } from "./constants";
import { fqLemToBigInt } from "./fq-lem-to-big-int";
import { limbOf } from "./limb-of";

export function g1Coordinates(lem: Uint8Array): [bigint, bigint] {
  const x = fqLemToBigInt(limbOf(lem, 0));
  const y = fqLemToBigInt(limbOf(lem, 1));
  if ((y * y - x * x * x - 3n) % BN254_FQ !== 0n)
    throw new FormatError("G1 point not on the curve");
  return [x, y];
}
