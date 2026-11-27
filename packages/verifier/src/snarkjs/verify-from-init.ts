/**
 * `zkey verifyfrominit` in a child process: the checks of `verifyFromR1cs` from the genesis zkey.
 * `entries` is how many MPC entries the zkey holds: its time bound grows with them.
 */
import { callWorker } from "./worker";
import type { VerifyOutcome } from "./in-process";
import type { LimitsOverride } from "./types";

export const verifyFromInit = (
  genesis: string,
  ptau: string,
  zkey: string,
  limits?: LimitsOverride,
  entries = 0,
): Promise<VerifyOutcome> => callWorker("verifyFromInit", [genesis, ptau, zkey], limits, entries);
