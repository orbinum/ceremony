/**
 * Mirrors a published ceremony, holding its lock; returns how many files it holds. Every file is
 * checked against the chain of pins that starts at the officially published SHA-256 of
 * ceremony.json: ceremony.json, init.json, the transcript, then every file they pin. What was
 * parsed is what was checked: the documents are re-read after their download, so their hashes are
 * compared again. Genesis keys come first, so a contribution's size bound is known before it is
 * fetched.
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
import { acceptTranscript } from "./accept-transcript";
import { fetchPinned } from "./fetch-pinned";
import { sizeBoundsOf } from "./size-bounds-of";
import type { DownloadOptions } from "./types";

const DOCUMENTS = 3;

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
  if (announcement.sha256 !== options.announcementSha256) throw new Error("ceremony.json changed");
  if (init.sha256 !== announcement.value.init_sha256) throw new Error("init.json changed");

  const transcript = await acceptTranscript(options, announcement, init.value);
  const boundOf = sizeBoundsOf(dir, transcript);
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
