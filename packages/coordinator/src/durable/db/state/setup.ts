/** The frozen setup, one row: null before `configure`, written once. */
import type { Setup } from "@orbinum-ceremony/core";
import { rowsOf } from "../rows-of";

export const readSetup = (sql: SqlStorage): Setup | null =>
  rowsOf<Setup>(sql.exec("SELECT json FROM setup"))[0] ?? null;

export const writeSetup = (sql: SqlStorage, s: Setup) =>
  sql.exec("INSERT INTO setup (id, json) VALUES (1, ?)", JSON.stringify(s));
