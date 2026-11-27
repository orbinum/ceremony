/** `snarkjs zkey export verificationkey` in a child process, as plain JSON. */
import { callWorker } from "./worker";
import type { LimitsOverride } from "./types";

export const exportVerificationKey = (
  zkey: string,
  limits?: LimitsOverride,
): Promise<Record<string, unknown>> => callWorker("exportVerificationKey", [zkey], limits);
