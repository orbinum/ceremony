/** Read-only views derived from the records alone. */
import type { CircuitName } from "../../config";
import type { CurrentHead } from "../../verification";
import type { AttestedContribution } from "../identity";
import {
  type AttestationRecord,
  type BeaconRecord,
  type Chained,
  type ContributionRecord,
  type FinalRecord,
  TRANSCRIPT_SCHEMA,
  type Transcript,
} from "./types";

/** The accepted contributions of one circuit, in chain order. */
export const contributionsOf = (records: readonly Chained[], circuit: CircuitName) =>
  records.filter(
    (r): r is Chained<ContributionRecord> => r.type === "contribution" && r.circuit === circuit,
  );

/** The sealed beacon, if any (there is at most one in a valid transcript). */
export const sealedBeaconOf = (records: readonly Chained[]) =>
  records.find((r): r is Chained<BeaconRecord> => r.type === "beacon");

/** The next session number: one past the highest recorded. */
export const nextSeq = (records: readonly Chained[]): number =>
  Math.max(0, ...records.map((r) => ("seq" in r ? r.seq : 0))) + 1;

/**
 * The head an upload must extend, derived from the transcript (SPEC §2.5). Trusts record order;
 * `checkCircuitLinks` is what proves that order is a gap-free chain.
 */
export function headOf(
  records: readonly Chained[],
  circuit: CircuitName,
  genesis: { sha256: string; csHash: string },
): CurrentHead & { index: number } {
  const accepted = contributionsOf(records, circuit);
  return {
    index: accepted.length,
    outputSha256: accepted.at(-1)?.output_sha256 ?? genesis.sha256,
    csHash: genesis.csHash,
    previous: accepted.map((r) => ({
      hash: r.contribution_hash,
      name: r.zkey_name,
      deltaAfter: r.delta_after,
    })),
  };
}

/** `transcript.json` for these records, anchored in the exact `ceremony.json` bytes. */
export const transcriptOf = (
  ceremonyId: string,
  announcementSha256: string,
  records: Chained[],
  finals: FinalRecord[] = [],
): Transcript => ({
  schema: TRANSCRIPT_SCHEMA,
  ceremony_id: ceremonyId,
  anchor: { file: "ceremony.json", sha256: announcementSha256 },
  records,
  finals,
});

/** A session's receipt: its contributions and attestation, each with its chain value. */
export interface Receipt {
  ceremony_id: string;
  anchor: Transcript["anchor"];
  seq: number;
  records: Chained<ContributionRecord | AttestationRecord>[];
}

/** The receipt of session `seq`, or null if it recorded nothing. */
export function receiptOf(transcript: Transcript, seq: number): Receipt | null {
  const records = transcript.records.filter(
    (r): r is Chained<ContributionRecord | AttestationRecord> =>
      (r.type === "contribution" || r.type === "attestation") && r.seq === seq,
  );
  return records.length === 0
    ? null
    : { ceremony_id: transcript.ceremony_id, anchor: transcript.anchor, seq, records };
}

/** The accepted contributions of session `seq` by `githubId`, in transcript order, by hashes only. */
export function attestedContributionsOf(
  records: readonly Chained[],
  seq: number,
  githubId: number,
): AttestedContribution[] {
  return records
    .filter(
      (r): r is Chained<ContributionRecord> =>
        r.type === "contribution" && r.seq === seq && r.identity?.github_id === githubId,
    )
    .map((r) => ({
      circuit: r.circuit,
      index: r.index,
      input_sha256: r.input_sha256,
      output_sha256: r.output_sha256,
      contribution_hash: r.contribution_hash,
    }));
}
