/**
 * The release's source tree, exported at its commit for compiling, with the clone's installed
 * circomlib checked against the version the release locks. SPEC §2.1.
 */
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { asObject, asString, lockedCircomlibOf, VERSION } from "@orbinum-ceremony/core";
import { ensureDir, readJsonFile } from "../io";
import { exportTree, showFile } from "../tools";
import type { CircuitRelease } from "./release";

/** The exported tree. */
export interface ExportedSource {
  /** Circuit sources live in `<dir>/circuits/<name>.circom`. */
  dir: string;
  circomlib: string;
}

/** The circomlib version installed in the clone. */
async function installedCircomlib(repo: string): Promise<string> {
  const path = join(repo, "node_modules", "circomlib", "package.json");
  const { value } = await readJsonFile(path, 1024 * 1024);
  return asString(
    asObject(value, "circomlib package.json").version,
    "circomlib version",
    32,
    VERSION,
  );
}

/**
 * Exports the release tree into `workDir` (no checkout, the repo is untouched) and links the
 * repo's installed `node_modules` after checking circomlib is the version locked at the release.
 * The verifier must have installed that clone itself: its install scripts run on their machine.
 */
export async function exportSource(
  release: CircuitRelease,
  workDir: string,
): Promise<ExportedSource> {
  const dir = join(workDir, "source");
  await ensureDir(dir);
  await exportTree(release.repo, release.commit, dir);

  const locked = lockedCircomlibOf(await showFile(release.repo, release.commit, "pnpm-lock.yaml"));
  const installed = await installedCircomlib(release.repo);
  if (locked !== installed) {
    throw new Error(`circomlib ${installed} installed, ${locked} locked at ${release.tag}`);
  }
  await symlink(join(release.repo, "node_modules"), join(dir, "node_modules"));
  return { dir, circomlib: installed };
}
