/** The `i`-th Fq limb (32 bytes) of a point as snarkjs stores it. */
import { FQ_BYTES } from "../constants";

export const limbOf = (lem: Uint8Array, i: number) =>
  lem.subarray(i * FQ_BYTES, (i + 1) * FQ_BYTES);
