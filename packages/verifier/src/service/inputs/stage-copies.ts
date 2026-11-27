/**
 * Stages the ptau and every genesis `init` names into a new private directory, one copy at a time:
 * snarkjs only ever opens these copies, never the sources.
 */
import { join } from "node:path";
import { CEREMONY_LAYOUT, type InitRecord, PTAU } from "@orbinum-ceremony/core";
import { createStage } from "../../files";
import type { Inputs, StagedCopies } from "./types";

export async function stageCopies(
  init: InitRecord,
  sources: Inputs["sources"],
): Promise<StagedCopies> {
  const stage = await createStage("orbinum-verifier-inputs-", sources.ceremonyDir);
  try {
    const genesis: Inputs["genesis"] = {};
    for (const c of init.circuits) {
      genesis[c.name] = {
        // oxlint-disable-next-line no-await-in-loop
        path: await stage.copy(
          join(sources.ceremonyDir, CEREMONY_LAYOUT.zkey(c.name, 0)),
          `${c.name}.genesis.zkey`,
        ),
        sha256: c.genesis_sha256,
      };
    }
    const ptau = await stage.copy(sources.ptau, "ptau", PTAU.sizeBytes);
    return { ptau, genesis, stage };
  } catch (error) {
    await stage.cleanup();
    throw error;
  }
}
