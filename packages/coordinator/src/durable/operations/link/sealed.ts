/** Whether the ceremony is sealed (FINALIZED): read-only from then on, so it links nothing more. */
import * as db from "../../db";
import type { Store } from "../../store";

export const sealed = (store: Store) => db.readQueue(store.sql)?.phase === "FINALIZED";
