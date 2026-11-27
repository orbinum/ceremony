/** The queue state, read without changing anything (null before `configure`). */
import type { QueueState } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export const snapshot = (store: Store): QueueState | null => db.readQueue(store.sql);
