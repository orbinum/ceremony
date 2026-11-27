/**
 * Every ceremony this network published (`/api/archive`), the latest to open first, each with its
 * announcement read the way every tool reads it (canonical, validated) and its last published
 * status. An announcement that cannot be read or is not valid is null, with the SHA-256 of the
 * bytes served so it can still be compared with the published one; `status.json` published before
 * v0.6.3 has no `contributors` until its next head.
 */
import {
  CEREMONY_LAYOUT,
  type CeremonyAnnouncement,
  fromUtf8,
  parseAnnouncement,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { call, getBytes } from "../http";
import type { ArchivedCeremony, ArchivedStatus } from "../types";
import { archivedFile } from "./archived-file";

async function archived(id: string, current: boolean): Promise<ArchivedCeremony> {
  const [bytes, status] = await Promise.all([
    getBytes(archivedFile(id, CEREMONY_LAYOUT.announcement)).catch(() => null),
    call<ArchivedStatus>("GET", archivedFile(id, CEREMONY_LAYOUT.status)).catch(() => null),
  ]);
  let announcement: CeremonyAnnouncement | null = null;
  try {
    announcement = bytes && parseAnnouncement(fromUtf8(bytes));
  } catch {
    announcement = null;
  }
  return { id, current, announcement, announcementSha256: bytes && sha256Hex(bytes), status };
}

const openedAt = (c: ArchivedCeremony) =>
  c.announcement ? Date.parse(c.announcement.schedule.open) : 0;

export async function getArchive(): Promise<ArchivedCeremony[]> {
  const index = await call<{ current: string | null; ceremonies: string[] }>("GET", "/api/archive");
  const all = await Promise.all(index.ceremonies.map((id) => archived(id, id === index.current)));
  return all.toSorted((a, b) => openedAt(b) - openedAt(a) || a.id.localeCompare(b.id));
}
