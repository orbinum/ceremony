/** Throws unless a stored G2 point, on the twist, is in the prime-order subgroup. */
import { bn254 } from "@noble/curves/bn254.js";
import { FormatError } from "../../../primitives/errors";
import { g2Coordinates } from "./g2-coordinates";

export function checkG2Subgroup(lem: Uint8Array): void {
  const { x, y } = g2Coordinates(lem);
  if (!bn254.G2.Point.fromAffine({ x, y }).isTorsionFree()) {
    throw new FormatError("G2 point outside the prime-order subgroup");
  }
}
