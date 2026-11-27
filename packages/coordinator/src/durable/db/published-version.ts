/** The version last written to each public key, so unchanged content is not written again. */
export const publishedVersion = (sql: SqlStorage, key: string): string | null =>
  sql.exec<{ version: string }>("SELECT version FROM published WHERE key = ?", key).toArray()[0]
    ?.version ?? null;

export const setPublishedVersion = (sql: SqlStorage, key: string, version: string) =>
  sql.exec(
    "INSERT INTO published (key, version) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET version = excluded.version",
    key,
    version,
  );
