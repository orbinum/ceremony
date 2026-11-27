/**
 * The ceremony as its anchors define it (what heads and the transcript must match, with each
 * circuit's csHash), and one accepted contribution as a transcript records it (`sha256`: the key it
 * produced).
 */
import type { CeremonyAnnouncement, CircuitName, InitRecord } from "@orbinum-ceremony/core";

export interface Anchors {
  announcement: CeremonyAnnouncement;
  announcementSha256: string;
  init: InitRecord;
  csHashes: Map<CircuitName, string>;
}

export interface Recorded {
  hash: string;
  name: string;
  sha256: string;
}
