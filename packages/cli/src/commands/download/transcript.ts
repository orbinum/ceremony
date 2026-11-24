/**
 * The mirror's transcript, the one file nothing pins in advance unless `--transcript-sha256`
 * does: it must be anchored in the pinned `ceremony.json` and pass core's integrity checks, and
 * may only extend a local one, before it replaces it or any file it names is fetched.
 */
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import {
  canonicalJson,
  type CeremonyAnnouncement,
  CEREMONY_LAYOUT,
  checkTranscriptIntegrity,
  type InitRecord,
  MAX_TRANSCRIPT_BYTES,
  type Transcript,
} from "@orbinum-ceremony/core";
import { layout, type Loaded, loadTranscript } from "../../artifacts";
import { downloadFirst } from "../../io";
import type { DownloadOptions } from "./options";

/**
 * Why `next` would roll the local transcript back: it must extend every local record (a sealed
 * beacon included) and keep any local finals.
 */
export function rollback(local: Transcript, next: Transcript): string[] {
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

/** Why `transcript` is refused: its pin, or every integrity check it fails. */
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

/** Fetches the mirror's transcript and, once accepted, puts it in place; returns it. */
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
