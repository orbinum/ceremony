/**
 * A stored G2 point's x and y as Fq2 (each stored c0‖c1), refused unless on the twist
 * y² = x³ + 3/(9+u). Subgroup membership is `checkG2Subgroup`'s.
 */
import { bn254 } from "@noble/curves/bn254.js";
import { FormatError } from "../../../primitives/errors";
import { fqLemToBigInt, limbOf } from "../field";

const { Fp2 } = bn254.fields;
const B2 = bn254.G2.Point.CURVE().b;

export function g2Coordinates(lem: Uint8Array) {
  const x = Fp2.create({ c0: fqLemToBigInt(limbOf(lem, 0)), c1: fqLemToBigInt(limbOf(lem, 1)) });
  const y = Fp2.create({ c0: fqLemToBigInt(limbOf(lem, 2)), c1: fqLemToBigInt(limbOf(lem, 3)) });
  if (!Fp2.eql(Fp2.sqr(y), Fp2.add(Fp2.mul(Fp2.sqr(x), x), B2))) {
    throw new FormatError("G2 point not on the curve");
  }
  return { x, y };
}
