/**
 * The verifier's own record of each attempt, under LOG_DIR (operator-only, never published): the
 * job, the verdict, timings, the log, then whether the report reached the coordinator. KL-30.
 */
import { constants } from "node:fs";
import { appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  attemptLogKey,
  type JobSpec,
  type VerificationResult,
  verifierLogOf,
} from "@orbinum-ceremony/core";
import { writeAtomic } from "../../files";
import { errorMessage } from "../../text";

/** Where the record of `job` lives. */
const recordPath = (logDir: string, job: JobSpec["job"]) => join(logDir, attemptLogKey(job));

/** Writes the record of one attempt, replacing any earlier one atomically. */
export const writeRecord = (
  logDir: string,
  job: JobSpec["job"],
  verdict: VerificationResult,
  ms: Record<string, number | undefined>,
  log: string,
): Promise<void> => writeAtomic(recordPath(logDir, job), verifierLogOf(job, verdict, ms, log));

/** Appends how the report went (`posted`, or why not) to a record already written; never through a link. */
export const appendReportOutcome = (
  logDir: string,
  job: JobSpec["job"],
  outcome: string,
): Promise<void> =>
  appendFile(recordPath(logDir, job), `[report] ${outcome}\n`, {
    flag: constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
  });

/**
 * Creates LOG_DIR and proves it writable with a probe file: at startup, so an unusable LOG_DIR
 * stops the service instead of turning every job into `infra` after its verification.
 */
export async function probeLogDir(logDir: string): Promise<void> {
  const probe = join(logDir, `.probe-${process.pid}`);
  try {
    await writeAtomic(probe, "");
    await rm(probe);
  } catch (error) {
    throw new Error(`LOG_DIR: not writable: ${errorMessage(error)}`, { cause: error });
  }
}
