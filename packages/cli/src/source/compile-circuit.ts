/** A circuit of the exported release compiled to r1cs with the pinned flags; its path and SHA-256. */
import { join } from "node:path";
import { type CircuitName, createSha256 } from "@orbinum-ceremony/core";
import { ensureDir, hashFile } from "../io";
import { compileR1cs } from "../tools";
import type { ExportedSource } from "./types";

export async function compileCircuit(
  source: ExportedSource,
  name: CircuitName,
  outDir: string,
  flags: readonly string[],
): Promise<{ path: string; sha256: string }> {
  await ensureDir(outDir);
  const path = await compileR1cs(
    join(source.dir, "circuits", `${name}.circom`),
    name,
    outDir,
    flags,
  );
  return { path, sha256: await hashFile(path, createSha256()) };
}
