/**
 * Where a job's uploads live privately: `verify/seq/circuit/attempt-` and a random suffix per
 * upload. The trailing `-` of the prefix keeps attempt `1-` from matching `10-`.
 */
import type { JobId } from "../types";

export const jobObjectPrefix = (job: JobId): string =>
  `verify/${job.seq}/${job.circuit}/${job.attempt}-`;

export const jobObjectKey = (job: JobId, suffix: string): string =>
  `${jobObjectPrefix(job)}${suffix}.zkey`;

export const isJobObjectKey = (job: JobId, key: string): boolean =>
  key.startsWith(jobObjectPrefix(job));
