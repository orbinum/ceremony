/** A job still waiting for its result: the verifier may read only these objects. */
import type { Job, JobId } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export function pendingJob(store: Store, id: JobId): Job | null {
  const job = db.readJob(store.sql, id);
  return job?.status === "pending" ? job : null;
}
