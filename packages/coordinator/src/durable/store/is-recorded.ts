/** Whether the transcript records a contribution at a job's index. */
import { contributionsOf, type Job } from "@orbinum-ceremony/core";
import { records } from "./records";
import type { Store } from "./types";

export const isRecorded = (store: Store, job: Job): boolean =>
  contributionsOf(records(store), job.circuit).some((r) => r.index === job.index);
