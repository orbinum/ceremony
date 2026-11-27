/** In a closed ceremony, every contributor is one of the announced invited accounts. */
import { type CeremonyAnnouncement, isClosed, isInvited } from "../../../announcement";
import type { Chained } from "../../types";

export function checkInvited(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): string[] {
  if (!isClosed(announcement)) return [];
  const outsiders = new Set<number>();
  for (const r of records) {
    const id = r.type === "contribution" ? r.identity?.github_id : undefined;
    if (id !== undefined && !isInvited(announcement, id)) outsiders.add(id);
  }
  return [...outsiders].map((id) => `GitHub id ${id} is not invited`);
}
