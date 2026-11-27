/**
 * The Groth16 evaluation domain snarkjs needs, as a power of two: the next power ≥ constraints +
 * public signals + 1.
 */
import type { R1csHeader } from "./types";

export function domainPower(
  h: Pick<R1csHeader, "constraints" | "publicOutputs" | "publicInputs">,
): number {
  return Math.ceil(Math.log2(h.constraints + h.publicOutputs + h.publicInputs + 1));
}
