/**
 * `snarkjs zkey contribute` in this process; returns h_k as snarkjs reports it (hex). An empty
 * `entropy` is drawn here, in the process that contributes (a child, when isolated), so the caller
 * never holds it; snarkjs adds 64 bytes of its own from the OS CSPRNG either way.
 */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../snarkjs-module.d.ts" />
import { randomBytes } from "node:crypto";
import { toHex } from "@orbinum-ceremony/core/snarkjs-child";
import { zKey } from "snarkjs";

export async function contribute(
  input: string,
  output: string,
  name: string,
  entropy: string,
): Promise<string> {
  const e = entropy || randomBytes(32).toString("hex");
  return toHex(await zKey.contribute(input, output, name, e));
}
