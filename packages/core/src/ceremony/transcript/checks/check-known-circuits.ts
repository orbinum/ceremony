/** Contributions recorded for circuits the ceremony does not have. */
import { circuitsOf, type InitRecord } from "../../init";
import type { Chained } from "../types";

export function checkKnownCircuits(records: readonly Chained[], init: InitRecord): string[] {
  const known = new Set(circuitsOf(init));
  return records.flatMap((r, i) =>
    r.type === "contribution" && !known.has(r.circuit) ? [`record ${i}: unknown circuit`] : [],
  );
}
