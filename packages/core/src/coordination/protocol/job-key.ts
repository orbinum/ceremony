/** `seq/circuit/attempt`: a job's path under `/internal/objects/` and its dedupe key. */
import type { JobId } from "./types";

export const jobKey = (job: JobId): string => `${job.seq}/${job.circuit}/${job.attempt}`;
