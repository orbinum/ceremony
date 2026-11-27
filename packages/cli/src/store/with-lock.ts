/**
 * Runs `fn` holding the exclusive lock on a ceremony directory: two operator commands must never
 * write it at once. The lock file is created exclusively; a stale one (its run is gone) is removed
 * by hand. On exit only the lock this run created is removed, not one another run took after this
 * one's was deleted by hand: compared while the descriptor is open, so its inode cannot be reused.
 */
import { lstat, mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";

export async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx");
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") {
      throw new Error(`ceremony is locked by another run (remove ${path} if that run is gone)`, {
        cause: error,
      });
    }
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    return await fn();
  } finally {
    const mine = await handle.stat().catch(() => null);
    const now = await lstat(path).catch(() => null);
    if (mine && now?.ino === mine.ino && now.dev === mine.dev) await rm(path, { force: true });
    await handle.close();
  }
}
