/**
 * Fetches `key` from a mirror into `dir` unless a copy with the expected digest is already there:
 * kept only with that digest (a downloaded file with another is deleted and the download fails),
 * never larger than `maxBytes`, and never written through a link planted in the ceremony
 * directory, since a symlinked directory on the way would carry the download outside `dir`.
 */
import { existsSync } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSha256, MAX_FILE_BYTES, type StreamingHasher } from "@orbinum-ceremony/core";
import { downloadFirst, ensureDir, hashFile } from "../../io";

async function refuseLinks(dir: string, key: string): Promise<void> {
  let at = dir;
  for (const part of dirname(key)
    .split("/")
    .filter((p) => p !== ".")) {
    at = join(at, part);
    const s = await lstat(at).catch(() => null);
    if (s === null) return;
    if (!s.isDirectory()) throw new Error(`${key}: ${at} is not a directory (a symlink?)`);
  }
}

export async function fetchPinned(
  from: string,
  dir: string,
  key: string,
  expected: string,
  hasher: () => StreamingHasher = createSha256,
  maxBytes = MAX_FILE_BYTES,
): Promise<void> {
  const path = join(dir, key);
  await refuseLinks(dir, key);
  if (existsSync(path) && (await hashFile(path, hasher(), maxBytes)) === expected) return;
  await ensureDir(dirname(path));
  await downloadFirst([`${from}/${key}`], path, maxBytes);
  if ((await hashFile(path, hasher(), maxBytes)) !== expected) {
    await rm(path, { force: true });
    throw new Error(`${key}: does not match its pinned hash`);
  }
}
