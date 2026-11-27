/**
 * Re-hashes the staged copies against their pins, genesis keys first, and records the outcome in
 * `pinned`. A failure on our own files must end as `infra`, never as a contributor's `rejected`.
 */
import { assertPinnedFile, assertPinnedPtau } from "../../pins";
import type { Inputs } from "./types";

export async function checkPins(inputs: Inputs): Promise<void> {
  try {
    for (const [name, g] of Object.entries(inputs.genesis)) {
      // oxlint-disable-next-line no-await-in-loop
      await assertPinnedFile(inputs.init, name, "genesis", g.path);
    }
    await assertPinnedPtau(inputs.ptau);
    inputs.pinned = true;
  } catch (error) {
    inputs.pinned = false;
    throw error;
  }
}
