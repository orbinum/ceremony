/**
 * Refuses a head that is not the end of its circuit's chain in a transcript anchored in the
 * announcement and passing core's integrity checks: a fork, a stale head, or other bytes than the
 * key it records last (the genesis pinned by `init.json` before any). The published transcript is
 * read first, the coordinator's live one (`/api/transcript`, never behind its commit nor withheld
 * by a failed publication) only if that does not match; the check fails closed when neither reads.
 * A transcript only behind the head may still be catching up (it is written after commit), and is
 * waited for up to a minute. Errors name check ids only: they come from the anchored announcement,
 * not from the coordinator.
 */
import {
  CEREMONY_LAYOUT,
  checkTranscriptIntegrity,
  type CircuitName,
  contributionsOf,
  fromUtf8,
  MAX_TRANSCRIPT_BYTES,
  type MpcParams,
  parseJsonText,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { type Contributor, fetchLiveTranscript, fetchPublic } from "../../../io";
import { sleep } from "../retry";
import { headMismatch } from "./head-mismatch";
import type { Anchors, Recorded } from "./types";

const TRANSCRIPT_LAG_MS = 60_000;
const TRANSCRIPT_POLL_MS = 5_000;

type TranscriptSource = "published" | "live";

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
    throw new Error(`the published transcript fails: ${failed.map((c) => c.id).join("; ")}`);
  }
  return contributionsOf(transcript.records, circuit).map((r) => ({
    hash: r.contribution_hash,
    name: r.zkey_name,
    sha256: r.output_sha256,
  }));
}

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
