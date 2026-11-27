/** Chains one transcript record onto the last and persists it, in memory and in SQLite. */
import { appendRecord, type Chained, type TranscriptRecord } from "@orbinum-ceremony/core";
import * as db from "../db";
import { records } from "./records";
import type { Store } from "./types";

export function append(store: Store, record: TranscriptRecord): Chained {
  const setup = db.readSetup(store.sql);
  if (!setup) throw new Error("append before configure");
  const chained = appendRecord(records(store).slice(-1), setup.chainGenesis, record);
  db.writeRecord(store.sql, chained);
  records(store).push(chained);
  return chained;
}
