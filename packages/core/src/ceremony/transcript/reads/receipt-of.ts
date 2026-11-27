/**
 * A session's receipt: its contributions and attestation, each with its chain value, under the
 * transcript's anchor; null if the session recorded nothing.
 */
import type { AttestationRecord, Chained, ContributionRecord, Transcript } from "../types";

export interface Receipt {
  ceremony_id: string;
  anchor: Transcript["anchor"];
  seq: number;
  records: Chained<ContributionRecord | AttestationRecord>[];
}

export function receiptOf(transcript: Transcript, seq: number): Receipt | null {
  const records = transcript.records.filter(
    (r): r is Chained<ContributionRecord | AttestationRecord> =>
      (r.type === "contribution" || r.type === "attestation") && r.seq === seq,
  );
  return records.length === 0
    ? null
    : { ceremony_id: transcript.ceremony_id, anchor: transcript.anchor, seq, records };
}
