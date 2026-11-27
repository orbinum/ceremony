/**
 * Writes the record of one attempt (the job, the verdict, timings, the log), replacing any earlier
 * one atomically.
 */
import { type JobSpec, type VerificationResult, verifierLogOf } from "@orbinum-ceremony/core";
import { writeAtomic } from "../../../files";
import { recordPath } from "./record-path";

export const writeRecord = (
  logDir: string,
  job: JobSpec["job"],
  verdict: VerificationResult,
  ms: Record<string, number | undefined>,
  log: string,
): Promise<void> => writeAtomic(recordPath(logDir, job), verifierLogOf(job, verdict, ms, log));
