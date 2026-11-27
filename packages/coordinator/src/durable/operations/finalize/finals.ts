/** The final records sealed at the handover (none before it). */
import * as db from "../../db";
import type { Store } from "../../store";

export const finals = (store: Store) => db.readFinals(store.sql);
