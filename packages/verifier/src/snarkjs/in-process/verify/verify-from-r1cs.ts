/** `zkey verify` from r1cs + ptau in this process, with the pass rule of `VerifyOutcome`. */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../../snarkjs-module.d.ts" />
import { zKey } from "snarkjs";
import { captureLogger } from "./capture-logger";
import { verifyOutcomeOf } from "./verify-outcome-of";

export async function verifyFromR1cs(r1cs: string, ptau: string, zkey: string) {
  const { lines, logger } = captureLogger();
  return verifyOutcomeOf(await zKey.verifyFromR1cs(r1cs, ptau, zkey, logger), lines);
}
