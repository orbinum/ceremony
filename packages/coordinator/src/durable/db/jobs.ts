/** Uploads and their verification jobs, keyed by `(seq, circuit, attempt)`. */
import type { Job, JobId } from "@orbinum-ceremony/core";
import { rowsOf } from "./schema";

/** One job, or null. */
export const readJob = (sql: SqlStorage, id: JobId): Job | null =>
  rowsOf<Job>(
    sql.exec(
      "SELECT json FROM jobs WHERE seq = ? AND circuit = ? AND attempt = ?",
      id.seq,
      id.circuit,
      id.attempt,
    ),
  )[0] ?? null;

/** Every job still waiting for its result. */
export const pendingJobs = (sql: SqlStorage): Job[] =>
  rowsOf<Job>(sql.exec("SELECT json FROM jobs WHERE status = 'pending'"));

/** The latest upload of this circuit by this identity, in any session. */
export const latestJob = (sql: SqlStorage, githubId: number, circuit: string): Job | null =>
  rowsOf<Job>(
    sql.exec(
      "SELECT json FROM jobs WHERE github_id = ? AND circuit = ? ORDER BY seq DESC, attempt DESC LIMIT 1",
      githubId,
      circuit,
    ),
  )[0] ?? null;

/** Inserts or updates a job (its report is kept without the log: core `storedReport`). */
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
