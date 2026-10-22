/** circom, the pinned compiler: its version and an r1cs build with the pinned flags. SPEC §2.1. */
import { join } from "node:path";
import { run } from "./process";

/** The version of the circom on PATH. */
export async function circomVersion(): Promise<string> {
  const out = await run("circom", ["--version"]);
  const version = /(\d+\.\d+\.\d+)/.exec(out)?.[1];
  if (!version) throw new Error("cannot parse the circom version");
  return version;
}

/** Compiles `source` with `flags` (core's `TOOLING.circomFlags`) and returns the `.r1cs` path. */
export async function compileR1cs(
  source: string,
  name: string,
  outDir: string,
  flags: readonly string[],
): Promise<string> {
  await run("circom", [source, ...flags, "-o", outDir]);
  return join(outDir, `${name}.r1cs`);
}
