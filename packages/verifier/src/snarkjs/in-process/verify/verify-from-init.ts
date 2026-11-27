/**
 * `zkey verifyfrominit` in this process: the checks of `verifyFromR1cs`, starting from the genesis
 * zkey instead of the r1cs.
 */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../../snarkjs-module.d.ts" />
import { zKey } from "snarkjs";
import { captureLogger } from "./capture-logger";
import { verifyOutcomeOf } from "./verify-outcome-of";

export async function verifyFromInit(genesis: string, ptau: string, zkey: string) {
  const { lines, logger } = captureLogger();
  return verifyOutcomeOf(await zKey.verifyFromInit(genesis, ptau, zkey, logger), lines);
}
