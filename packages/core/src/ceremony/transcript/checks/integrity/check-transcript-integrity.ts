/**
 * The invariants that hold at every moment of a ceremony: anchor, hash chain, per-circuit links,
 * known circuits, window, no simulated contributions outside rehearsals. The coordinator checks
 * these before publishing.
 */
import type { CeremonyAnnouncement } from "../../../announcement";
import type { InitRecord } from "../../../init";
import { chainGenesis, verifyChain } from "../../chain";
import type { Transcript } from "../../types";
import { checkAnchor } from "./check-anchor";
import { checkCircuitLinks } from "./check-circuit-links";
import { checkKnownCircuits } from "./check-known-circuits";
import { checkRecordsInWindow } from "./check-records-in-window";
import { checkSimulated } from "./check-simulated";
import type { TranscriptCheck } from "../types";

export function checkTranscriptIntegrity(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
  init: InitRecord,
): TranscriptCheck[] {
  const chain = verifyChain(
    transcript.records,
    chainGenesis(announcement.ceremony_id, announcement),
  );
  return [
    {
      id: "transcript is anchored in the pinned ceremony.json",
      problems: checkAnchor(transcript, announcement, announcementSha256),
    },
    {
      id: "hash chain verifies from the announcement",
      problems: chain.ok ? [] : [`broken at record ${chain.position}`],
      detail: `${transcript.records.length} records`,
    },
    {
      id: "per-circuit contributions link genesis → … → head",
      problems: [
        ...checkKnownCircuits(transcript.records, init),
        ...checkCircuitLinks(transcript.records, init),
      ],
    },
    {
      id: "records belong to this ceremony, inside the announced window",
      problems: checkRecordsInWindow(transcript.records, announcement),
    },
    {
      id: `no simulated contributions on ${announcement.network}`,
      problems: checkSimulated(transcript.records, announcement),
    },
  ];
}
