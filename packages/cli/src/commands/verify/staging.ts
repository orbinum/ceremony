/**
 * Private copies of every input `verify` reads (SPEC §7): staged once under the ceremony
 * directory's containment rule, and a check on an input that failed to stage fails instead of
 * passing.
 */
import { type CircuitName, circuitsOf, type InitRecord, PTAU } from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import type { Stage } from "../../io";
import type { Report } from "../../ui";

/** Staged (private) copies of every per-circuit input; a missing entry failed to stage. */
export interface StagedFiles {
  ptau?: string;
  r1cs: Map<CircuitName, string>;
  genesis: Map<CircuitName, string>;
  finalZkey: Map<CircuitName, string>;
  finalVk: Map<CircuitName, string>;
}

/** Reads a staged file path or throws, so a check on an unstaged input fails instead of passing. */
export const staged = (map: Map<CircuitName, string>, c: CircuitName, what: string): string => {
  const path = map.get(c);
  if (!path) throw new Error(`${c} ${what} could not be staged`);
  return path;
};

/** Stages every circuit's r1cs, genesis, final zkey and vk, and the ptau. */
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
    // oxlint-disable-next-line no-await-in-loop -- copies are sequential to bound memory
    await report.attempt(
      `${c}: inputs are regular files (r1cs, genesis, final zkey, vk)`,
      async () => {
        for (const [map, source, suffix] of copies) {
          // oxlint-disable-next-line no-await-in-loop -- one file at a time
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
