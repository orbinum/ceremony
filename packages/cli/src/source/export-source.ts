/**
 * Exports the release tree into `workDir` (no checkout, the repo is untouched) and links the repo's
 * installed `node_modules`, after checking its circomlib is the version locked at the release. The
 * verifier must have installed that clone itself: its install scripts run on their machine. The
 * clone's HEAD must be the release commit, so what is installed came from the tag's own lockfile
 * (`pnpm install --frozen-lockfile --ignore-scripts` at the tag), not from another branch's.
 */
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { asObject, asString, lockedCircomlibOf, VERSION } from "@orbinum-ceremony/core";
import { ensureDir, readJsonFile } from "../io";
import { exportTree, resolveCommit, showFile } from "../tools";
import type { CircuitRelease, ExportedSource } from "./types";

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

export async function exportSource(
  release: CircuitRelease,
  workDir: string,
): Promise<ExportedSource> {
  const head = await resolveCommit(release.repo, "HEAD");
  if (head !== release.commit) {
    throw new Error(
      `the clone's HEAD is ${head}, not ${release.tag} (${release.commit}): check out the tag and install from its lockfile`,
    );
  }
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
