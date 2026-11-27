/**
 * Takes (or renews) a hold on work in flight outside the object (an upload streaming, a final file
 * being written) until it lapses, purging lapsed holds. Kept in SQLite, so an evicted object still
 * sees it.
 */
export function takeHold(sql: SqlStorage, id: string, key: string, until: number, now: number) {
  sql.exec("DELETE FROM holds WHERE until <= ?", now);
  sql.exec(
    "INSERT INTO holds (id, key, until) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET key = excluded.key, until = excluded.until",
    id,
    key,
    until,
  );
}
