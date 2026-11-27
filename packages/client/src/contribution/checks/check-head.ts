/**
 * The head the browser downloads is the one announced, by its hash, and the announced circuit's,
 * by its csHash; returns its MPC chain.
 */
import { type MpcParams, readMpcParams, sha256Hex } from "@orbinum-ceremony/core";
import { CheckFailed } from "./check-failed";

export function checkHead(bytes: Uint8Array, sha256: string, csHash: string): MpcParams {
  if (sha256Hex(bytes) !== sha256) throw new CheckFailed("the download does not match its hash");
  const params = readMpcParams(bytes);
  if (params.csHash !== csHash) throw new CheckFailed("the download is not this circuit's key");
  return params;
}
