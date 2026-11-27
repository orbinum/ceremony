/**
 * Fetches the mirror's transcript and, once accepted, puts it in place; returns it. It is the one
 * file nothing pins in advance unless `--transcript-sha256` does: it must be anchored in the pinned
 * `ceremony.json` and pass core's integrity checks, and may only extend a local one (unless
 * `force`), before it replaces it or any file it names is fetched.
 */
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import {
  type CeremonyAnnouncement,
  CEREMONY_LAYOUT,
  checkTranscriptIntegrity,
  type InitRecord,
  MAX_TRANSCRIPT_BYTES,
  type Transcript,
} from "@orbinum-ceremony/core";
import { layout, type Loaded, loadTranscript } from "../../artifacts";
import { downloadFirst } from "../../io";
import { rollback } from "./rollback";
import type { DownloadOptions } from "./types";

function refusals(
  loaded: Loaded<Transcript>,
  pin: string | undefined,
  announcement: Loaded<CeremonyAnnouncement>,
  init: InitRecord,
): string[] {
  if (pin && loaded.sha256 !== pin) return ["it is not the one --transcript-sha256 pins"];
  return checkTranscriptIntegrity(loaded.value, announcement.value, announcement.sha256, init)
    .filter((c) => c.problems.length > 0)
    .map((c) => `${c.id}: ${c.problems.join("; ")}`);
}

export async function acceptTranscript(
  options: DownloadOptions,
  announcement: Loaded<CeremonyAnnouncement>,
  init: InitRecord,
): Promise<Transcript> {
  const paths = layout(options.dir);
  const incoming = `${paths.transcript}.download`;
  try {
    await downloadFirst(
      [`${options.from}/${CEREMONY_LAYOUT.transcript}`],
      incoming,
      MAX_TRANSCRIPT_BYTES,
    );
    const loaded = await loadTranscript(options.dir, incoming);
    const refused = refusals(loaded, options.transcriptSha256, announcement, init);
    if (refused.length > 0) throw new Error(`transcript.json refused: ${refused.join(" | ")}`);
    if (existsSync(paths.transcript) && !options.force) {
      const local = await loadTranscript(options.dir).catch((error: unknown) => {
        throw new Error(`local transcript.json: ${(error as Error).message} (--force replaces it)`);
      });
      const behind = rollback(local.value, loaded.value);
      if (behind.length > 0) {
        throw new Error(
          `transcript.json refused: it would roll back the local one (${behind.join("; ")}); --force replaces it`,
        );
      }
    }
    await rename(incoming, paths.transcript);
    return loaded.value;
  } finally {
    await rm(incoming, { force: true });
  }
}
