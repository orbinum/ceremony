/**
 * The announced release's source, exported with the local circom and the circomlib that init.json
 * recorded; undefined when either differs.
 */
import { ensureDir } from "../../../io";
import { type CircuitRelease, type ExportedSource, exportSource } from "../../../source";
import { circomVersion } from "../../../tools";
import type { VerifyContext } from "../types";
import { workDir } from "../context";

export async function exportRelease(ctx: VerifyContext, rel: CircuitRelease) {
  const { report, init } = ctx;
  let source: ExportedSource | undefined;
  await report.attempt(`local circom is ${init.value.tooling.circom} (as at init)`, async () =>
    (await circomVersion()) === init.value.tooling.circom ? [] : ["different circom version"],
  );
  await report.attempt(
    "release source exported, with the circomlib init.json recorded",
    async () => {
      await ensureDir(workDir(ctx));
      const s = await exportSource(rel, workDir(ctx));
      if (s.circomlib !== init.value.tooling.circomlib) {
        return [`circomlib ${s.circomlib}, init.json recorded ${init.value.tooling.circomlib}`];
      }
      source = s;
      return [];
    },
  );
  return source;
}
