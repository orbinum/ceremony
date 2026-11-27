/**
 * Private copies of every input `verify` reads: every circuit's r1cs, genesis, final zkey and vk,
 * and the ptau, staged once under the ceremony directory's containment rule. Staging is itself a
 * reported check, so an input that failed to stage has no entry and the checks on it fail.
 */
import { type CircuitName, circuitsOf, type InitRecord, PTAU } from "@orbinum-ceremony/core";
import { layout } from "../../../artifacts";
import type { Stage } from "../../../io";
import type { Report } from "../../../ui";
import type { StagedFiles } from "../types";

export async function stageInputs(
  dir: string,
  ptau: string,
  init: InitRecord,
  report: Report,
  stage: Stage,
): Promise<StagedFiles> {
  const paths = layout(dir);
  const files: StagedFiles = {
    r1cs: new Map(),
    genesis: new Map(),
    finalZkey: new Map(),
    finalVk: new Map(),
  };
  const copies: [Map<CircuitName, string>, (c: CircuitName) => string, string][] = [
    [files.r1cs, paths.r1cs, "r1cs"],
    [files.genesis, (c) => paths.zkey(c, 0), "genesis.zkey"],
    [files.finalZkey, paths.finalZkey, "final.zkey"],
    [files.finalVk, paths.finalVk, "vk.json"],
  ];
  for (const c of circuitsOf(init)) {
    await report.attempt(
      `${c}: inputs are regular files (r1cs, genesis, final zkey, vk)`,
      async () => {
        for (const [map, source, suffix] of copies) {
          map.set(c, await stage.copy(source(c), `${c}.${suffix}`));
        }
      },
    );
  }
  await report.attempt("ptau is a regular file", async () => {
    files.ptau = await stage.copy(ptau, "ptau", PTAU.sizeBytes);
  });
  return files;
}
