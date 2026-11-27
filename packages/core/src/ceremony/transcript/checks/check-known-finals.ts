/** Final records of circuits the ceremony does not have. */
import { circuitsOf, type InitRecord } from "../../init";
import type { FinalRecord } from "../types";

export function checkKnownFinals(finals: readonly FinalRecord[], init: InitRecord): string[] {
  const known = new Set(circuitsOf(init));
  return finals.flatMap((f) => (known.has(f.circuit) ? [] : [`${f.circuit} is not in init.json`]));
}
