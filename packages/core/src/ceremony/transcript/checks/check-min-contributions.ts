/** Each circuit reached the announced minimum of contributions. */
import type { CeremonyAnnouncement } from "../../announcement";
import { circuitsOf, type InitRecord } from "../../init";
import { contributionsOf } from "../contributions-of";
import type { Chained } from "../types";

export const checkMinContributions = (
  records: readonly Chained[],
  init: InitRecord,
  announcement: CeremonyAnnouncement,
): string[] =>
  circuitsOf(init).flatMap((c) => {
    const n = contributionsOf(records, c).length;
    return n >= announcement.min_contributions ? [] : [`${c}: ${n}`];
  });
