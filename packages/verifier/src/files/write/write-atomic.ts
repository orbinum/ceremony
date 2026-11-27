/**
 * Writes a file so that readers and crashes never see a partial one: a fresh temp file in the same
 * directory (created exclusively, so a planted path is never followed), flushed to disk, renamed,
 * then the directory entry flushed. On failure the temp file is removed. Some filesystems refuse
 * fsync on a directory; that flush is best effort, the file itself is already synced.
 */
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await open(tmp, "wx", 0o644);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
  await syncDir(dir);
}

async function syncDir(dir: string): Promise<void> {
  try {
    const handle = await open(dir, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {}
}
