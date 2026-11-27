/**
 * Everything a finished transcript must satisfy: the integrity invariants plus verifiable
 * identities, invitations in a closed ceremony, the minimum, the sealed beacon and finals of known
 * circuits only. Returns the checks in report order and the sealed beacon when there is one.
 */
import { type CeremonyAnnouncement, isClosed } from "../../announcement";
import type { InitRecord } from "../../init";
import type { BeaconRecord, Chained, Transcript } from "../types";
import { checkIdentities } from "./check-identities";
import { checkInvited } from "./check-invited";
import { checkKnownFinals } from "./check-known-finals";
import { checkMinContributions } from "./check-min-contributions";
import { checkSealedBeacon } from "./check-sealed-beacon";
import { checkTranscriptIntegrity } from "./check-transcript-integrity";
import type { TranscriptCheck } from "./types";

export function checkTranscript(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
  init: InitRecord,
): { checks: TranscriptCheck[]; beacon?: Chained<BeaconRecord> } {
  const { beacon, problems } = checkSealedBeacon(transcript.records, announcement);
  const identities = checkIdentities(transcript.records, announcement);
  return {
    checks: [
      ...checkTranscriptIntegrity(transcript, announcement, announcementSha256, init),
      {
        id: "signatures verify; one GitHub account and one wallet per circuit",
        problems: identities.problems,
        detail: `${identities.attested} of ${identities.contributions} contributions attested`,
      },
      ...(isClosed(announcement)
        ? [
            {
              id: "closed ceremony: every contributor was invited",
              problems: checkInvited(transcript.records, announcement),
              detail: `${announcement.admission?.invited.length} invited`,
            },
          ]
        : []),
      {
        id: `every circuit has at least ${announcement.min_contributions} contributions`,
        problems: checkMinContributions(transcript.records, init, announcement),
      },
      {
        id: "beacon is the announced drand round, sealed once after all contributions",
        problems,
        ...(beacon ? { detail: `round ${beacon.round}` } : {}),
      },
      {
        id: "final records name only this ceremony's circuits",
        problems: checkKnownFinals(transcript.finals, init),
      },
    ],
    ...(beacon ? { beacon } : {}),
  };
}
