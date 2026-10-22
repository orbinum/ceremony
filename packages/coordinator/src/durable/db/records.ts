/** The transcript's records, in chain order, and what was last published. */
import type { Chained } from "@orbinum-ceremony/core";
import { rowsOf } from "./schema";

/** Every record, in order. */
export const readRecords = (sql: SqlStorage): Chained[] =>
  rowsOf<Chained>(sql.exec("SELECT json FROM records ORDER BY n"));

/** Appends one chained record. */
export const writeRecord = (sql: SqlStorage, record: Chained) =>
  sql.exec("INSERT INTO records (json) VALUES (?)", JSON.stringify(record));

/** The version last written to a public key, so unchanged content is not written again. */
export const publishedVersion = (sql: SqlStorage, key: string): string | null =>
  sql.exec<{ version: string }>("SELECT version FROM published WHERE key = ?", key).toArray()[0]
    ?.version ?? null;

/** Records what was written to a public key. */
export const setPublishedVersion = (sql: SqlStorage, key: string, version: string) =>
  sql.exec(
    "INSERT INTO published (key, version) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET version = excluded.version",
    key,
    version,
  );
