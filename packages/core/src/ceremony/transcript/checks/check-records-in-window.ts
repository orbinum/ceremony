/** Every record is this ceremony's, and every contribution was accepted inside the window. */
import { acceptanceWindow, type CeremonyAnnouncement } from "../../announcement";
import type { Chained } from "../types";

export function checkRecordsInWindow(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): string[] {
  const { from, to } = acceptanceWindow(announcement);
  return records.flatMap((r, i) => {
    const problems =
      r.ceremony_id === announcement.ceremony_id ? [] : [`record ${i}: another ceremony`];
    if (r.type === "contribution") {
      const at = Date.parse(r.verified_by.at);
      if (at < from || at > to) {
        problems.push(`${r.circuit} #${r.index}: accepted outside the contribution window`);
      }
    }
    return problems;
  });
}
