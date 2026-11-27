/** Compiles a circuit with circom and `flags` (core's pinned `TOOLING.circomFlags`); returns the `.r1cs` path. */
import { join } from "node:path";
import { run } from "../process";

export async function compileR1cs(
  source: string,
  name: string,
  outDir: string,
  flags: readonly string[],
): Promise<string> {
  await run("circom", [source, ...flags, "-o", outDir]);
  return join(outDir, `${name}.r1cs`);
}
