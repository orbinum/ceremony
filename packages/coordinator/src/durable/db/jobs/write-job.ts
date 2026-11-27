/** Inserts or updates a job; its report is stored without the log (core `storedReport`). */
import type { Job } from "@orbinum-ceremony/core";

export const writeJob = (sql: SqlStorage, job: Job) =>
  sql.exec(
    `INSERT INTO jobs (seq, circuit, attempt, github_id, status, json) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (seq, circuit, attempt) DO UPDATE SET status = excluded.status, json = excluded.json`,
    job.seq,
    job.circuit,
    job.attempt,
    job.githubId,
    job.status,
    JSON.stringify(job),
  );
