/** `transcript.json` for a set of records, anchored in the exact `ceremony.json` bytes. */
import { TRANSCRIPT_SCHEMA } from "../constants";
import type { Chained, FinalRecord, Transcript } from "../types";

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
