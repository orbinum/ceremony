/**
 * The ceremony as its own anchors define it, and the head a contribution may extend: `ceremony.json`
 * must hash to the officially announced SHA-256 and `init.json` to the hash it pins; a head must be
 * the end of its circuit's chain in a transcript anchored there.
 */
import {
  type CeremonyAnnouncement,
  CEREMONY_LAYOUT,
  checkTranscriptIntegrity,
  type CircuitName,
  contributionsOf,
  fromUtf8,
  type InitRecord,
  MAX_DOCUMENT_BYTES,
  MAX_TRANSCRIPT_BYTES,
  type MpcParams,
  parseAnnouncement,
  parseInit,
  parseJsonText,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { type Contributor, fetchAnnounced, fetchLiveTranscript, fetchPublic } from "../../io";
import { sleep } from "./retry";

/** A published transcript behind the head is waited for this long (it is written after commit). */
const TRANSCRIPT_LAG_MS = 60_000;
const TRANSCRIPT_POLL_MS = 5_000;

/** The ceremony as its anchors define it: what heads and the transcript must match. */
export interface Anchors {
  announcement: CeremonyAnnouncement;
  announcementSha256: string;
  init: InitRecord;
  /** Each circuit's csHash. */
  csHashes: Map<CircuitName, string>;
}

/** The ceremony from its anchors, every document checked against its pin before it is read. */
export async function anchoredCeremony(
  who: Contributor,
  announcementSha256: string,
): Promise<Anchors> {
  const doc = async (key: string, sha256: string) =>
    fromUtf8(await fetchAnnounced(who.origin, `/artifacts/${key}`, sha256, MAX_DOCUMENT_BYTES));
  const announcement = parseAnnouncement(
    await doc(CEREMONY_LAYOUT.announcement, announcementSha256),
  );
  const init = parseInit(await doc(CEREMONY_LAYOUT.init, announcement.init_sha256));
  return {
    announcement,
    announcementSha256,
    init,
    csHashes: new Map(init.circuits.map((c) => [c.name, c.cs_hash])),
  };
}

/** One accepted contribution as a transcript records it. */
export interface Recorded {
  hash: string;
  name: string;
  /** The key it produced. */
  sha256: string;
}

/** Where a transcript is read: the published file, or the coordinator's live one. */
type TranscriptSource = "published" | "live";

/**
 * The accepted contributions of `circuit` in the transcript `source` serves, once it is anchored
 * in the announcement and passes core's integrity checks. The live one (`/api/transcript`) is read
 * from the coordinator's object: never behind its commit, nor withheld by a failed publication.
 */
async function recordedContributions(
  who: Contributor,
  anchors: Anchors,
  circuit: CircuitName,
  source: TranscriptSource,
): Promise<Recorded[]> {
  const path =
    source === "published" ? `/artifacts/${CEREMONY_LAYOUT.transcript}` : "/api/transcript";
  const bytes =
    source === "published"
      ? await fetchPublic(who.origin, path, MAX_TRANSCRIPT_BYTES)
      : await fetchLiveTranscript(who.origin, MAX_TRANSCRIPT_BYTES);
  const transcript = validateTranscript(parseJsonText(fromUtf8(bytes), path));
  const failed = checkTranscriptIntegrity(
    transcript,
    anchors.announcement,
    anchors.announcementSha256,
    anchors.init,
  ).filter((c) => c.problems.length > 0);
  if (failed.length > 0) {
    // Check ids only: they come from the anchored announcement, not from the coordinator.
    throw new Error(`the published transcript fails: ${failed.map((c) => c.id).join("; ")}`);
  }
  return contributionsOf(transcript.records, circuit).map((r) => ({
    hash: r.contribution_hash,
    name: r.zkey_name,
    sha256: r.output_sha256,
  }));
}

/**
 * Why a head whose MPC entries are `entries` is not the one the transcript `recorded` ends with
 * (same contributions, hash and name, in order), or null.
 */
export function headMismatch(
  entries: readonly Pick<MpcParams["entries"][number], "hash" | "name">[],
  recorded: readonly Pick<Recorded, "hash" | "name">[],
): string | null {
  const forked = recorded.findIndex(
    (r, i) =>
      i < entries.length && (entries[i]?.hash !== r.hash || (entries[i]?.name ?? "") !== r.name),
  );
  if (forked !== -1) return `forks from the published transcript at #${forked + 1}`;
  if (entries.length < recorded.length) {
    return `is stale: ${entries.length} contributions, the published transcript records ${recorded.length}`;
  }
  if (entries.length > recorded.length) {
    return `has ${entries.length} contributions, the published transcript records only ${recorded.length}`;
  }
  return null;
}

/**
 * The closer to the head of the two transcripts (the published file first, the live one only if
 * that does not match), and why the head is not its end; failing closed when neither reads.
 */
async function closestRecord(
  who: Contributor,
  anchors: Anchors,
  circuit: CircuitName,
  entries: MpcParams["entries"],
): Promise<{ recorded: Recorded[]; mismatch: string | null }> {
  let best: { recorded: Recorded[]; mismatch: string | null } | null = null;
  const failures: Error[] = [];
  for (const source of ["published", "live"] as const) {
    let recorded: Recorded[];
    try {
      recorded = await recordedContributions(who, anchors, circuit, source);
    } catch (error) {
      failures.push(error as Error);
      continue;
    }
    if (best === null || recorded.length > best.recorded.length) {
      best = { recorded, mismatch: headMismatch(entries, recorded) };
    }
    if (best.mismatch === null) break;
  }
  if (best === null) {
    const reasons = failures.map((f) => f.message).join("; ");
    throw new Error(`${circuit}: cannot check the head: ${reasons}`, { cause: failures[0] });
  }
  return best;
}

/**
 * Refuses a head that is not the end of the circuit's chain in the transcript (a fork or a stale
 * head, or other bytes than the key it records last: the genesis pinned by `init.json` before
 * any). A transcript only behind the head may still be catching up, and is waited for a while.
 */
export async function assertRecordedHead(
  who: Contributor,
  anchors: Anchors,
  circuit: CircuitName,
  head: { entries: MpcParams["entries"]; sha256: string },
  signal?: AbortSignal,
): Promise<void> {
  const { entries } = head;
  const genesis = anchors.init.circuits.find((c) => c.name === circuit)?.genesis_sha256;
  const deadline = Date.now() + TRANSCRIPT_LAG_MS;
  for (;;) {
    const { recorded, mismatch } = await closestRecord(who, anchors, circuit, entries);
    if (mismatch === null) {
      if (head.sha256 === (recorded.at(-1)?.sha256 ?? genesis)) return;
      throw new Error(`${circuit}: refusing the head, which is not the key the transcript records`);
    }
    const behind =
      entries.length > recorded.length &&
      headMismatch(entries.slice(0, recorded.length), recorded) === null;
    if (!behind || Date.now() + TRANSCRIPT_POLL_MS > deadline) {
      throw new Error(`${circuit}: refusing the head, which ${mismatch}`);
    }
    await sleep(TRANSCRIPT_POLL_MS, signal);
  }
}
