/**
 * `zkey verify` from r1cs + ptau in a child process: valid only if snarkjs returns true and logs
 * "ZKey Ok!". `entries` is how many MPC entries the zkey holds: its time bound grows with them.
 */
import { callWorker } from "./worker";
import type { VerifyOutcome } from "./in-process";
import type { LimitsOverride } from "./types";

export const verifyFromR1cs = (
  r1cs: string,
  ptau: string,
  zkey: string,
  limits?: LimitsOverride,
  entries = 0,
): Promise<VerifyOutcome> => callWorker("verifyFromR1cs", [r1cs, ptau, zkey], limits, entries);
