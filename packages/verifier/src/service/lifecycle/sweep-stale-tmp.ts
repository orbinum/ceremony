/**
 * Removes what a previous run left in tmpdir when it was killed (up to 128 MiB per job, plus the
 * staged ptau): only this service's private directories (work, upload stage, inputs stage), only
 * those untouched for 6 hours, longer than any job or service run could still be using them, and
 * never through a link.
 */
import { lstat, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OWN_TMP = /^orbinum-(verifier|upload|verifier-inputs)-/;

const STALE_TMP_MS = 6 * 60 * 60_000;

export async function sweepStaleTmp(dir = tmpdir(), now = Date.now()): Promise<number> {
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!OWN_TMP.test(name)) continue;
    const path = join(dir, name);
    // oxlint-disable-next-line no-await-in-loop
    const info = await lstat(path).catch(() => null);
    if (!info?.isDirectory() || now - info.mtimeMs < STALE_TMP_MS) continue;
    // oxlint-disable-next-line no-await-in-loop
    await rm(path, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
