/**
 * The ceremonies this network published (`/api/archive`) and each one's public record
 * (`/archive/<id>/…`): its announcement, read the way every tool reads it (canonical, validated),
 * and its last published status. SPEC §6.1.
 */
import {
  CEREMONY_LAYOUT,
  type CeremonyAnnouncement,
  fromUtf8,
  parseAnnouncement,
  sha256Hex,
  type statusOf,
} from "@orbinum-ceremony/core";
import { call, getBytes } from "./http";

/** What `status.json` says: phase, sessions and each circuit's head. */
export type ArchivedStatus = ReturnType<typeof statusOf>;

/** One published ceremony as the archive page shows it. */
export interface ArchivedCeremony {
  id: string;
  /** The ceremony this site runs now. */
  current: boolean;
  /** Null when its `ceremony.json` could not be read or is not a valid announcement. */
  announcement: CeremonyAnnouncement | null;
  /** SHA-256 of the `ceremony.json` bytes served here, to compare with the published one. */
  announcementSha256: string | null;
  status: ArchivedStatus | null;
}

/** Where one of a ceremony's public files is served. */
export const archivedFile = (id: string, file: string) => `/archive/${id}/${file}`;

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

/** Every ceremony this network published, the latest to open first. */
export async function getArchive(): Promise<ArchivedCeremony[]> {
  const index = await call<{ current: string | null; ceremonies: string[] }>("GET", "/api/archive");
  const all = await Promise.all(index.ceremonies.map((id) => archived(id, id === index.current)));
  return all.toSorted((a, b) => openedAt(b) - openedAt(a) || a.id.localeCompare(b.id));
}
