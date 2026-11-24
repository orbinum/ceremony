/**
 * `download`: mirrors a published ceremony, every file checked against the chain of pins that
 * starts at the officially published SHA-256 of ceremony.json (SPEC §6.1–6.3). The transcript,
 * the one file nothing pins in advance, must be anchored in that ceremony.json and pass core's
 * integrity checks before any file it names is fetched.
 */
import { existsSync } from "node:fs";
import { lstat, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  canonicalJson,
  CEREMONY_LAYOUT,
  checkTranscriptIntegrity,
  circuitsOf,
  createBlake2b512,
  createSha256,
  MAX_FILE_BYTES,
  MAX_LOG_CHARS,
  MAX_TRANSCRIPT_BYTES,
  maxUploadSize,
  pinnedFiles,
  PTAU,
  type StreamingHasher,
  type Transcript,
} from "@orbinum-ceremony/core";
import { layout, loadAnnouncement, loadInit, loadTranscript } from "../../artifacts";
import { downloadFirst, ensureDir, hashFile } from "../../io";
import { withLock } from "../../store";
import type { Command } from "../types";
import { DOWNLOAD_USAGE, type DownloadOptions, parseDownloadOptions } from "./options";

/** ceremony.json, init.json and transcript.json. */
const DOCUMENTS = 3;

/**
 * Fetches `key` unless a copy with the expected digest is already there; a downloaded file with
 * another digest is deleted and the download fails.
 */
async function fetchPinned(
  options: DownloadOptions,
  key: string,
  expected: string,
  hasher: () => StreamingHasher = createSha256,
  maxBytes = MAX_FILE_BYTES,
): Promise<void> {
  const path = join(options.dir, key);
  await refuseLinks(options.dir, key);
  if (existsSync(path) && (await hashFile(path, hasher(), maxBytes)) === expected) return;
  await ensureDir(dirname(path));
  await downloadFirst([`${options.from}/${key}`], path, maxBytes);
  if ((await hashFile(path, hasher(), maxBytes)) !== expected) {
    await rm(path, { force: true });
    throw new Error(`${key}: does not match its pinned hash`);
  }
}

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
    // oxlint-disable-next-line no-await-in-loop -- one path component after the other
    const s = await lstat(at).catch(() => null);
    if (s === null) return;
    if (!s.isDirectory()) throw new Error(`${key}: ${at} is not a directory (a symlink?)`);
  }
}

/**
 * Why `next` would roll the local transcript back: it must extend every local record (a sealed
 * beacon included) and keep any local finals.
 */
function rollback(local: Transcript, next: Transcript): string[] {
  const problems: string[] = [];
  if (local.records.length > next.records.length) {
    problems.push(`${next.records.length} records, ${local.records.length} here`);
  }
  if (local.records.some((r, i) => next.records[i] && next.records[i].chain !== r.chain)) {
    problems.push("does not extend the local chain");
  }
  if (local.finals.length > 0 && canonicalJson(local.finals) !== canonicalJson(next.finals)) {
    problems.push("drops or changes the local finals");
  }
  return problems;
}

/**
 * Mirrors the ceremony, holding its lock; returns how many files it holds. The new transcript is
 * checked before it replaces the local one, which it may only extend unless `force`.
 */
export async function runDownload(options: DownloadOptions): Promise<number> {
  await ensureDir(options.dir);
  return withLock(layout(options.dir).lock, () => download(options));
}

async function download(options: DownloadOptions): Promise<number> {
  const paths = layout(options.dir);
  await fetchPinned(options, CEREMONY_LAYOUT.announcement, options.announcementSha256);
  const announcement = await loadAnnouncement(options.dir);
  await fetchPinned(options, CEREMONY_LAYOUT.init, announcement.value.init_sha256);
  const init = await loadInit(options.dir);
  // What was parsed is what was checked: the files are re-read, so compare again.
  if (announcement.sha256 !== options.announcementSha256) throw new Error("ceremony.json changed");
  if (init.sha256 !== announcement.value.init_sha256) throw new Error("init.json changed");

  const incoming = `${paths.transcript}.download`;
  let transcript: Transcript;
  try {
    await downloadFirst(
      [`${options.from}/${CEREMONY_LAYOUT.transcript}`],
      incoming,
      MAX_TRANSCRIPT_BYTES,
    );
    const loaded = await loadTranscript(options.dir, incoming);
    if (options.transcriptSha256 && loaded.sha256 !== options.transcriptSha256) {
      throw new Error("transcript.json refused: it is not the one --transcript-sha256 pins");
    }
    transcript = loaded.value;
    const broken = checkTranscriptIntegrity(
      transcript,
      announcement.value,
      announcement.sha256,
      init.value,
    ).flatMap((c) => (c.problems.length > 0 ? [`${c.id}: ${c.problems.join("; ")}`] : []));
    if (broken.length > 0) throw new Error(`transcript.json refused: ${broken.join(" | ")}`);
    if (existsSync(paths.transcript) && !options.force) {
      const local = await loadTranscript(options.dir).catch((error: unknown) => {
        throw new Error(`local transcript.json: ${(error as Error).message} (--force replaces it)`);
      });
      const behind = rollback(local.value, transcript);
      if (behind.length > 0) {
        throw new Error(
          `transcript.json refused: it would roll back the local one (${behind.join("; ")}); --force replaces it`,
        );
      }
    }
    await rename(incoming, paths.transcript);
  } finally {
    await rm(incoming, { force: true });
  }

  // An accepted zkey is at most its genesis plus 1 KiB per entry, a log at most MAX_LOG_CHARS:
  // a mirror cannot fill the disk with files no coordinator could have accepted.
  const bounds = new Map<string, () => Promise<number>>();
  for (const r of transcript.records) {
    if (r.type !== "contribution") continue;
    const genesis = join(options.dir, CEREMONY_LAYOUT.zkey(r.circuit, 0));
    bounds.set(CEREMONY_LAYOUT.zkey(r.circuit, r.index), async () =>
      maxUploadSize((await stat(genesis)).size, r.index),
    );
    bounds.set(CEREMONY_LAYOUT.log(r.circuit, r.index), async () => MAX_LOG_CHARS);
  }
  // Genesis keys come first, so a contribution's bound is known before it is fetched.
  const files = pinnedFiles(init.value, transcript);
  for (const { key, sha256 } of files) {
    // oxlint-disable-next-line no-await-in-loop -- one large download at a time
    const maxBytes = (await bounds.get(key)?.()) ?? MAX_FILE_BYTES;
    // oxlint-disable-next-line no-await-in-loop -- one large download at a time
    await fetchPinned(options, key, sha256, createSha256, maxBytes);
  }
  if (options.withPtau) {
    await fetchPinned(
      options,
      CEREMONY_LAYOUT.ptau,
      PTAU.blake2b512,
      createBlake2b512,
      PTAU.sizeBytes,
    );
  }
  const count = DOCUMENTS + files.length + (options.withPtau ? 1 : 0);
  const circuits = circuitsOf(init.value).join(", ");
  console.log(`downloaded ${announcement.value.ceremony_id} (${circuits}): ${count} files`);
  return count;
}

/** `download` as the entry point runs it. */
export const downloadCommand: Command = {
  summary: "Mirror a published ceremony, every file checked against its pin",
  usage: DOWNLOAD_USAGE,
  run: async (argv) => {
    await runDownload(parseDownloadOptions(argv));
  },
};
