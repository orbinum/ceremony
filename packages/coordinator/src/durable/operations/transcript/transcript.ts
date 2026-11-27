/** The transcript so far and the chain value it starts from (null before `configure`). */
import type { Chained } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";

export function transcript(store: Store): { chainGenesis: string; records: Chained[] } | null {
  const setup = db.readSetup(store.sql);
  return setup && { chainGenesis: setup.chainGenesis, records: records(store) };
}
