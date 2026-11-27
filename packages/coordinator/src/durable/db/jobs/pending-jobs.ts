/** Every job still waiting for its verifier result. */
import type { Job } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const pendingJobs = (sql: SqlStorage): Job[] =>
  rowsOf<Job>(sql.exec("SELECT json FROM jobs WHERE status = 'pending'"));
