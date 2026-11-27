/** The next session number: one past the highest recorded. */
import type { Chained } from "../types";

export const nextSeq = (records: readonly Chained[]): number =>
  Math.max(0, ...records.map((r) => ("seq" in r ? r.seq : 0))) + 1;
