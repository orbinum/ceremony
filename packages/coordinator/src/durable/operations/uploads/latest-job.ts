/** The caller's latest upload of a circuit and what became of it. */
import type { CircuitName, Job } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export const latestJob = (store: Store, githubId: number, circuit: CircuitName): Job | null =>
  db.latestJob(store.sql, githubId, circuit);
