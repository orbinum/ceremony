/**
 * Where the verifier's own record of an attempt lives, under LOG_DIR (operator-only, never
 * published).
 */
import { join } from "node:path";
import { attemptLogKey, type JobSpec } from "@orbinum-ceremony/core";

export const recordPath = (logDir: string, job: JobSpec["job"]) => join(logDir, attemptLogKey(job));
