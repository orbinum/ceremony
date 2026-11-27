/** A store over the object's storage, its tables created if they are not yet. */
import * as db from "../db";
import type { Store } from "./types";

export function storeOf(storage: DurableObjectStorage, env: Env): Store {
  storage.sql.exec(db.SCHEMA);
  return {
    sql: storage.sql,
    storage,
    env,
    cache: null,
    publishing: Promise.resolve(),
    promoting: new Set(),
    receivedAt: new Map(),
  };
}
