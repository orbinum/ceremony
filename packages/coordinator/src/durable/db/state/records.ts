/** The transcript's chained records: read all in chain order, appended one at a time. */
import type { Chained } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const readRecords = (sql: SqlStorage): Chained[] =>
  rowsOf<Chained>(sql.exec("SELECT json FROM records ORDER BY n"));

export const writeRecord = (sql: SqlStorage, record: Chained) =>
  sql.exec("INSERT INTO records (json) VALUES (?)", JSON.stringify(record));
