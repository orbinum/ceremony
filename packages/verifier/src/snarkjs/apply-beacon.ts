/** `snarkjs zkey beacon` in a child process: the final, public-randomness step. */
import { callWorker } from "./worker";
import type { LimitsOverride } from "./types";

export const applyBeacon = (
  input: string,
  output: string,
  name: string,
  beaconHex: string,
  iterationsExp: number,
  limits?: LimitsOverride,
): Promise<void> =>
  callWorker("applyBeacon", [input, output, name, beaconHex, iterationsExp], limits);
