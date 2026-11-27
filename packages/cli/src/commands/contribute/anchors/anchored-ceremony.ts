/**
 * The ceremony from its anchors: `ceremony.json` must hash to the officially announced SHA-256 and
 * `init.json` to the hash it pins, each checked before it is read.
 */
import {
  CEREMONY_LAYOUT,
  fromUtf8,
  MAX_DOCUMENT_BYTES,
  parseAnnouncement,
  parseInit,
} from "@orbinum-ceremony/core";
import { type Contributor, fetchAnnounced } from "../../../io";
import type { Anchors } from "./types";

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
