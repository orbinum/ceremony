/**
 * Spends a value that may be used once (an OAuth state, a request MAC) until it would be refused
 * anyway, purging expired ones; false if it was spent already.
 */
export function spendOnce(sql: SqlStorage, key: string, now: number, expiresAt: number): boolean {
  sql.exec("DELETE FROM spent WHERE expires_at <= ?", now);
  return (
    sql
      .exec(
        "INSERT INTO spent (key, expires_at) VALUES (?, ?) ON CONFLICT (key) DO NOTHING RETURNING key",
        key,
        expiresAt,
      )
      .toArray().length > 0
  );
}
