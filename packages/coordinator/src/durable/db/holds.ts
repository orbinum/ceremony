/**
 * Holds on work in flight outside the object (an upload streaming, a final file being written),
 * each until it lapses: kept in SQLite, so an evicted object still sees them.
 */

/** Takes (or renews) hold `id` on `key` until `until`, purging lapsed holds. */
export function takeHold(sql: SqlStorage, id: string, key: string, until: number, now: number) {
  sql.exec("DELETE FROM holds WHERE until <= ?", now);
  sql.exec(
    "INSERT INTO holds (id, key, until) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET key = excluded.key, until = excluded.until",
    id,
    key,
    until,
  );
}

/** Whether hold `id` is live at `now`. */
export const holdLive = (sql: SqlStorage, id: string, now: number): boolean =>
  sql.exec("SELECT 1 FROM holds WHERE id = ? AND until > ?", id, now).toArray().length > 0;

/** Whether any hold whose id starts with `prefix` is live at `now`. */
export const anyHoldLive = (sql: SqlStorage, prefix: string, now: number): boolean =>
  sql
    .exec(
      "SELECT 1 FROM holds WHERE substr(id, 1, ?) = ? AND until > ? LIMIT 1",
      prefix.length,
      prefix,
      now,
    )
    .toArray().length > 0;

/** Releases hold `id`. */
export const releaseHold = (sql: SqlStorage, id: string) => {
  sql.exec("DELETE FROM holds WHERE id = ?", id);
};

/** Releases every hold on `key`. */
export const releaseHoldsOn = (sql: SqlStorage, key: string) => {
  sql.exec("DELETE FROM holds WHERE key = ?", key);
};
