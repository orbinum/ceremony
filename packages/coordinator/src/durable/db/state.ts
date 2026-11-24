/** The frozen setup, the queue state and a sealed ceremony's finals: one row each. */
import { circuitsOf, type FinalRecord, type QueueState, type Setup } from "@orbinum-ceremony/core";
import { rowsOf } from "./schema";

/** The configured setup, or null before `configure`. */
export const readSetup = (sql: SqlStorage): Setup | null =>
  rowsOf<Setup>(sql.exec("SELECT json FROM setup"))[0] ?? null;

/** Freezes the setup (written once). */
export const writeSetup = (sql: SqlStorage, s: Setup) =>
  sql.exec("INSERT INTO setup (id, json) VALUES (1, ?)", JSON.stringify(s));

/** The queue state, or null before `configure`. */
export function readQueue(sql: SqlStorage): QueueState | null {
  const state = rowsOf<QueueState>(sql.exec("SELECT json FROM queue_state"))[0] ?? null;
  return state && upgradeQueue(sql, state);
}

/**
 * A state stored by an earlier release, brought to the current shape: before 0.4.0 the queue did
 * not keep its circuits, which are the frozen setup's.
 */
function upgradeQueue(sql: SqlStorage, state: QueueState): QueueState {
  if (Array.isArray(state.circuits)) return state;
  const setup = readSetup(sql);
  return { ...state, circuits: setup ? circuitsOf(setup.init) : [] };
}

/** Replaces the queue state. */
export const writeQueue = (sql: SqlStorage, s: QueueState) =>
  sql.exec(
    "INSERT INTO queue_state (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json",
    JSON.stringify(s),
  );

/** The final records a sealed ceremony keeps (empty before it is sealed). */
export const readFinals = (sql: SqlStorage): FinalRecord[] =>
  rowsOf<FinalRecord[]>(sql.exec("SELECT json FROM finals"))[0] ?? [];

/** Keeps the final records (written once, with the beacon). */
export const writeFinals = (sql: SqlStorage, finals: FinalRecord[]) =>
  sql.exec("INSERT INTO finals (id, json) VALUES (1, ?)", JSON.stringify(finals));
