/** The transcript records in chain order, read from SQLite once and then kept in memory. */
import type { Chained } from "@orbinum-ceremony/core";
import * as db from "../db";
import type { Store } from "./types";

export function records(store: Store): Chained[] {
  store.cache ??= db.readRecords(store.sql);
  return store.cache;
}
