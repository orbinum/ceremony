/** The upload streaming to `key` ended, stored or not: its job may take another. */
import * as db from "../../db";
import type { Store } from "../../store";

export function releaseUpload(store: Store, key: string): void {
  db.releaseHoldsOn(store.sql, key);
}
