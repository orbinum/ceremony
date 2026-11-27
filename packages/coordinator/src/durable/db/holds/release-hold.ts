/** Releases holds before they lapse: one hold by its id, or every hold on a key. */
export const releaseHold = (sql: SqlStorage, id: string) => {
  sql.exec("DELETE FROM holds WHERE id = ?", id);
};

export const releaseHoldsOn = (sql: SqlStorage, key: string) => {
  sql.exec("DELETE FROM holds WHERE key = ?", key);
};
