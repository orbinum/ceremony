/** The head of a circuit: what the next contribution must extend. */
import { type CircuitName, headOfSetup } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";

export function head(
  store: Store,
  circuit: CircuitName,
): { index: number; outputSha256: string } | null {
  const setup = db.readSetup(store.sql);
  const h = setup && headOfSetup(setup, records(store), circuit);
  return h && { index: h.index, outputSha256: h.outputSha256 };
}
