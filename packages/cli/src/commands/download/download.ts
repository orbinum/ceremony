/**
 * `download`: mirrors a published ceremony, every file checked against the chain of pins that
 * starts at the officially published SHA-256 of ceremony.json (SPEC §6.1–6.3): ceremony.json,
 * init.json, the transcript (`transcript.ts`), then every file they pin (`pinned.ts`).
 */
import {
  CEREMONY_LAYOUT,
  circuitsOf,
  createBlake2b512,
  createSha256,
  pinnedFiles,
  PTAU,
} from "@orbinum-ceremony/core";
import { layout, loadAnnouncement, loadInit } from "../../artifacts";
import { ensureDir } from "../../io";
import { withLock } from "../../store";
import type { Command } from "../types";
import { DOWNLOAD_USAGE, type DownloadOptions, parseDownloadOptions } from "./options";
import { fetchPinned, sizeBoundsOf } from "./pinned";
import { acceptTranscript } from "./transcript";

/** ceremony.json, init.json and transcript.json. */
const DOCUMENTS = 3;

/**
 * Mirrors the ceremony, holding its lock; returns how many files it holds. The new transcript is
 * checked before it replaces the local one, which it may only extend unless `force`.
 */
export async function runDownload(options: DownloadOptions): Promise<number> {
  await ensureDir(options.dir);
  return withLock(layout(options.dir).lock, () => download(options));
}

async function download(options: DownloadOptions): Promise<number> {
  const { from, dir } = options;
  await fetchPinned(from, dir, CEREMONY_LAYOUT.announcement, options.announcementSha256);
  const announcement = await loadAnnouncement(dir);
  await fetchPinned(from, dir, CEREMONY_LAYOUT.init, announcement.value.init_sha256);
  const init = await loadInit(dir);
  // What was parsed is what was checked: the files are re-read, so compare again.
  if (announcement.sha256 !== options.announcementSha256) throw new Error("ceremony.json changed");
  if (init.sha256 !== announcement.value.init_sha256) throw new Error("init.json changed");

  const transcript = await acceptTranscript(options, announcement, init.value);
  const boundOf = sizeBoundsOf(dir, transcript);
  // Genesis keys come first, so a contribution's bound is known before it is fetched.
  const files = pinnedFiles(init.value, transcript);
  for (const { key, sha256 } of files) {
    await fetchPinned(from, dir, key, sha256, createSha256, await boundOf(key));
  }
  if (options.withPtau) {
    await fetchPinned(
      from,
      dir,
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
