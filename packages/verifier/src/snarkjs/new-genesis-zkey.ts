/** `snarkjs groth16 setup` in a child process: the genesis zkey (δ = 1) for one circuit. */
import { callWorker } from "./worker";
import type { LimitsOverride } from "./types";

export const newGenesisZkey = (
  r1cs: string,
  ptau: string,
  out: string,
  limits?: LimitsOverride,
): Promise<void> => callWorker("newGenesisZkey", [r1cs, ptau, out], limits);
