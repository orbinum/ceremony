/**
 * Appends whether the report reached the coordinator (`posted`, or why not) to an attempt record
 * already written; never through a link.
 */
import { constants } from "node:fs";
import { appendFile } from "node:fs/promises";
import type { JobSpec } from "@orbinum-ceremony/core";
import { recordPath } from "./record-path";

export const appendReportOutcome = (
  logDir: string,
  job: JobSpec["job"],
  outcome: string,
): Promise<void> =>
  appendFile(recordPath(logDir, job), `[report] ${outcome}\n`, {
    flag: constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
  });
