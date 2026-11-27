/**
 * Throws unless `bytes` is a sequence of G1 points (the zkey's L and H), each canonical and on the
 * curve or the point at infinity (all zero). Linear in the size.
 */
import { FormatError } from "../../../primitives/errors";
import { FQ_BYTES } from "../constants";
import { g1Coordinates } from "./g1-coordinates";

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
