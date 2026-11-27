/** `snarkjs groth16 setup` in this process: the genesis zkey (δ = 1) for one circuit. */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../snarkjs-module.d.ts" />
import { zKey } from "snarkjs";

export async function newGenesisZkey(r1cs: string, ptau: string, out: string): Promise<void> {
  await zKey.newZKey(r1cs, ptau, out);
}
