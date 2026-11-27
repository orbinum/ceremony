/**
 * What must hold in the transcript before the irreversible beacon is applied: contributions
 * closed, the minimum reached, and every contribution inside the window. A coordinator must also
 * be CLOSED with no verification in flight; that is the operator's state, not the transcript's.
 */
import type { CeremonyAnnouncement } from "../../announcement";
import type { InitRecord } from "../../init";
import type { Chained } from "../types";
import { checkMinContributions } from "./check-min-contributions";
import { checkRecordsInWindow } from "./check-records-in-window";

export function checkFinalizable(
  records: readonly Chained[],
  init: InitRecord,
  announcement: CeremonyAnnouncement,
  now: number,
): string[] {
  const problems: string[] = [];
  if (now < Date.parse(announcement.schedule.close)) {
    problems.push(`contributions are open until ${announcement.schedule.close}`);
  }
  problems.push(
    ...checkMinContributions(records, init, announcement).map((p) => `${p} contributions`),
  );
  problems.push(...checkRecordsInWindow(records, announcement));
  return problems;
}
