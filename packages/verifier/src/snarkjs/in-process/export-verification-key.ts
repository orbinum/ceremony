/**
 * `snarkjs zkey export verificationkey` in this process, as plain JSON (snarkjs's vk.json format).
 */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../snarkjs-module.d.ts" />
import { zKey } from "snarkjs";

export const exportVerificationKey = (zkey: string): Promise<Record<string, unknown>> =>
  zKey.exportVerificationKey(zkey);
