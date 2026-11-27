/** Whether a hold is live at `now`: one hold by its id, or any hold whose id has a prefix. */
export const holdLive = (sql: SqlStorage, id: string, now: number): boolean =>
  sql.exec("SELECT 1 FROM holds WHERE id = ? AND until > ?", id, now).toArray().length > 0;

export const anyHoldLive = (sql: SqlStorage, prefix: string, now: number): boolean =>
  sql
    .exec(
      "SELECT 1 FROM holds WHERE substr(id, 1, ?) = ? AND until > ? LIMIT 1",
      prefix.length,
      prefix,
      now,
    )
    .toArray().length > 0;
