/** The transcript is this ceremony's, anchored in the exact `ceremony.json` bytes. */
import type { CeremonyAnnouncement } from "../../announcement";
import type { Transcript } from "../types";

export function checkAnchor(
  transcript: Transcript,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
): string[] {
  return [
    ...(transcript.ceremony_id === announcement.ceremony_id ? [] : ["ceremony id differs"]),
    ...(transcript.anchor.sha256 === announcementSha256 ? [] : ["anchor SHA-256 differs"]),
  ];
}
