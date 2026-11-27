/**
 * Releases holds before they lapse: one hold by its id, or every hold on a key. Holds that name no
 * key (final-file writes) are never released by key: an empty key releases nothing.
 */
export const releaseHold = (sql: SqlStorage, id: string) => {
  sql.exec("DELETE FROM holds WHERE id = ?", id);
};

export const releaseHoldsOn = (sql: SqlStorage, key: string) => {
  if (key === "") return;
  sql.exec("DELETE FROM holds WHERE key = ?", key);
};
