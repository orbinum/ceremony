/**
 * The object's state, shared by its operations: SQLite, the alarm, the buckets, an in-memory copy
 * of the transcript records, the one publication in flight, the result being promoted and the
 * uploads streaming.
 * SPEC §4.3, §6.3.
 */
import { appendRecord, type Chained, type TranscriptRecord } from "@orbinum-ceremony/core";
import * as db from "../db";

/** What every operation of the object works on. */
export interface Store {
  sql: SqlStorage;
  storage: DurableObjectStorage;
  env: Env;
  /** The records, read once and kept in step with every append. */
  cache: Chained[] | null;
  /** The publication in flight: publications run one after another, the latest state last. */
  publishing: Promise<unknown>;
  /** Indexes (`circuit/index`) whose public copies a result is writing: one writer per index. */
  promoting: Set<string>;
  /** When each result being promoted (by index) was received: the clock holds at the earliest. */
  receivedAt: Map<string, number>;
  /** The upload streaming for each job (`seq/circuit/attempt`): one at a time per turn. */
  streaming: Map<string, { key: string; until: number }>;
  /** Final-file writes in flight (hold → until when it lapses): finalization waits for them. */
  writingFinals: Map<string, number>;
}

/** A store over the object's storage, its tables created if they are not yet. */
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
    streaming: new Map(),
    writingFinals: new Map(),
  };
}

/** The transcript records, in chain order. */
export function records(store: Store): Chained[] {
  store.cache ??= db.readRecords(store.sql);
  return store.cache;
}

/** Chains and persists one record. */
export function append(store: Store, record: TranscriptRecord): Chained {
  const setup = db.readSetup(store.sql);
  if (!setup) throw new Error("append before configure");
  const chained = appendRecord(records(store).slice(-1), setup.chainGenesis, record);
  db.writeRecord(store.sql, chained);
  records(store).push(chained);
  return chained;
}
