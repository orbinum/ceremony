/**
 * Real keys for the checks: core's 1-constraint fixture chain (`multiplier_1` has one contribution,
 * `multiplier_2` extends it by one). Each call returns fresh bytes: the code under test zeroes them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMpcParams, sha256Hex } from "@orbinum-ceremony/core";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "core", "tests", "fixtures");

export const zkey = (name: "multiplier_1" | "multiplier_2"): Uint8Array =>
  new Uint8Array(readFileSync(join(FIXTURES, `${name}.zkey`)));

export function flip(bytes: Uint8Array, at: number): Uint8Array {
  const i = at < 0 ? bytes.length + at : at;
  bytes[i] = (bytes[i] ?? 0) ^ 1;
  return bytes;
}

export function chain() {
  const head = zkey("multiplier_1");
  const output = zkey("multiplier_2");
  const params = readMpcParams(head);
  return {
    head,
    headSha256: sha256Hex(head),
    headIndex: params.entries.length,
    csHash: params.csHash,
    params,
    output,
    outputSha256: sha256Hex(output),
    contributionHash: readMpcParams(output).entries.at(-1)?.hash as string,
  };
}
