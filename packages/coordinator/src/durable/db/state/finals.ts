/** The final records a sealed ceremony keeps, one row written once with the beacon; empty before. */
import type { FinalRecord } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const readFinals = (sql: SqlStorage): FinalRecord[] =>
  rowsOf<FinalRecord[]>(sql.exec("SELECT json FROM finals"))[0] ?? [];

export const writeFinals = (sql: SqlStorage, finals: FinalRecord[]) =>
  sql.exec("INSERT INTO finals (id, json) VALUES (1, ?)", JSON.stringify(finals));
