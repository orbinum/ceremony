/** One upload's verification job, keyed by `(seq, circuit, attempt)`, or null. */
import type { Job, JobId } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const readJob = (sql: SqlStorage, id: JobId): Job | null =>
  rowsOf<Job>(
    sql.exec(
      "SELECT json FROM jobs WHERE seq = ? AND circuit = ? AND attempt = ?",
      id.seq,
      id.circuit,
      id.attempt,
    ),
  )[0] ?? null;
