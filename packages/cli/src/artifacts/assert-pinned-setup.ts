/**
 * The pinned inputs an operator command builds on, checked with the verifier's pins: the ptau,
 * every genesis, and (when `r1cs`) every r1cs. Checked once, before anything is written.
 */
import { circuitsOf, type InitRecord } from "@orbinum-ceremony/core";
import { assertPinnedFile, assertPinnedPtau } from "../io";
import { layout } from "./layout";

export async function assertPinnedSetup(
  dir: string,
  init: InitRecord,
  ptau: string,
  { r1cs = false } = {},
): Promise<void> {
  const paths = layout(dir);
  await assertPinnedPtau(ptau);
  for (const c of circuitsOf(init)) {
    await assertPinnedFile(init, c, "genesis", paths.zkey(c, 0));
    if (r1cs) await assertPinnedFile(init, c, "r1cs", paths.r1cs(c));
  }
}
