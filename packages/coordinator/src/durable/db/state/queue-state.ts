/**
 * The queue state, one row: null before `configure`, replaced on every commit. A state stored by
 * a release before 0.4.0 lacks its circuits, which are read back from the frozen setup.
 */
import { circuitsOf, type QueueState } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";
import { readSetup } from "./setup";

export function readQueue(sql: SqlStorage): QueueState | null {
  const state = rowsOf<QueueState>(sql.exec("SELECT json FROM queue_state"))[0] ?? null;
  return state && upgradeQueue(sql, state);
}

function upgradeQueue(sql: SqlStorage, state: QueueState): QueueState {
  if (Array.isArray(state.circuits)) return state;
  const setup = readSetup(sql);
  return { ...state, circuits: setup ? circuitsOf(setup.init) : [] };
}

export const writeQueue = (sql: SqlStorage, s: QueueState) =>
  sql.exec(
    "INSERT INTO queue_state (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json",
    JSON.stringify(s),
  );
