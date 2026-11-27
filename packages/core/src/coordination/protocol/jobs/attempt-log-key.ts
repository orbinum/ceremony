/** Where the verifier keeps an attempt's record, under its log directory. */
import type { JobSpec } from "../types";

export const attemptLogKey = (job: JobSpec["job"]): string =>
  `${job.circuit}/${job.index}-${job.seq}-${job.attempt}.log`;
