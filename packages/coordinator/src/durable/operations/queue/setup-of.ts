/** The setup the ceremony runs (null before `configure`). */
import type { Setup } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export const setupOf = (store: Store): Setup | null => db.readSetup(store.sql);
