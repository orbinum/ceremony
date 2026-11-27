/** `snarkjs zkey beacon` in this process: the final, public-randomness step. */
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../snarkjs-module.d.ts" />
import { zKey } from "snarkjs";

export async function applyBeacon(
  input: string,
  output: string,
  name: string,
  beaconHex: string,
  iterationsExp: number,
): Promise<void> {
  const result = await zKey.beacon(input, output, name, beaconHex, iterationsExp);
  if (!result) throw new Error("snarkjs refused the beacon parameters");
}
