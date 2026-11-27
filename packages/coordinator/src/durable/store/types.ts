/**
 * What every operation of the object works on: SQLite, the alarm, the bindings, the transcript
 * records read once and kept in step with every append, the one publication in flight (they run
 * one after another, the latest state last), the public indexes (`circuit/index`) a result is
 * writing (one writer per index), and when each result being promoted was received (the clock
 * holds at the earliest).
 */
import type { Chained } from "@orbinum-ceremony/core";

export interface Store {
  sql: SqlStorage;
  storage: DurableObjectStorage;
  env: Env;
  cache: Chained[] | null;
  publishing: Promise<unknown>;
  promoting: Set<string>;
  receivedAt: Map<string, number>;
}
