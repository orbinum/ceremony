/** Rows of a `json` column, parsed without validation: the object wrote them itself. */
export const rowsOf = <T>(cursor: SqlStorageCursor<{ json: string }>): T[] =>
  cursor.toArray().map((r) => JSON.parse(r.json) as T);
