/** The wallet linked to an identity, if any. */
import type { LinkedIdentity } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export const linked = (store: Store, githubId: number): LinkedIdentity | null =>
  db.readIdentity(store.sql, githubId);
