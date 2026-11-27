/** The latest upload of a circuit by an identity, in any session. */
import type { Job } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const latestJob = (sql: SqlStorage, githubId: number, circuit: string): Job | null =>
  rowsOf<Job>(
    sql.exec(
      "SELECT json FROM jobs WHERE github_id = ? AND circuit = ? ORDER BY seq DESC, attempt DESC LIMIT 1",
      githubId,
      circuit,
    ),
  )[0] ?? null;
