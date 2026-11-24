/**
 * Files fetched against their pins: kept only with the expected digest, never written through a
 * link planted in the ceremony directory, never larger than an honest one can be.
 */
import { existsSync } from "node:fs";
import { lstat, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CEREMONY_LAYOUT,
  createSha256,
  MAX_FILE_BYTES,
  MAX_LOG_CHARS,
  maxUploadSize,
  type StreamingHasher,
  type Transcript,
} from "@orbinum-ceremony/core";
import { downloadFirst, ensureDir, hashFile } from "../../io";

/**
 * Refuses a key whose existing directories under `dir` are not plain directories: a symlink
 * there would carry the download outside `dir`.
 */
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

/**
 * Fetches `key` from `from` into `dir` unless a copy with the expected digest is already there; a
 * downloaded file with another digest is deleted and the download fails.
 */
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

/**
 * The largest each file the transcript names may be: an accepted zkey is at most its genesis plus
 * 1 KiB per entry, a log at most `MAX_LOG_CHARS`, so a mirror cannot fill the disk with files no
 * coordinator could have accepted. A zkey's bound needs its genesis, fetched first.
 */
export function sizeBoundsOf(dir: string, transcript: Transcript) {
  const bounds = new Map<string, () => Promise<number>>();
  for (const r of transcript.records) {
    if (r.type !== "contribution") continue;
    const genesis = join(dir, CEREMONY_LAYOUT.zkey(r.circuit, 0));
    bounds.set(CEREMONY_LAYOUT.zkey(r.circuit, r.index), async () =>
      maxUploadSize((await stat(genesis)).size, r.index),
    );
    bounds.set(CEREMONY_LAYOUT.log(r.circuit, r.index), async () => MAX_LOG_CHARS);
  }
  return async (key: string) => (await bounds.get(key)?.()) ?? MAX_FILE_BYTES;
}
