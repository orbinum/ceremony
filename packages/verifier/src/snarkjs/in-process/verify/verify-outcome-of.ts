/**
 * A verification's outcome from what snarkjs returned and the lines it logged, by core's pass rule.
 */
import { zkeyVerifyPassed } from "@orbinum-ceremony/core/snarkjs-child";
import type { VerifyOutcome } from "./types";

export const verifyOutcomeOf = (returned: boolean, lines: string[]): VerifyOutcome => {
  const log = lines.join("\n");
  return { ok: zkeyVerifyPassed(returned, log), log };
};
