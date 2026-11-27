/** Whether some identity holds this wallet key: 1 GitHub = 1 wallet, by `account_key`. */
export const walletTaken = (sql: SqlStorage, accountKey: string): boolean =>
  sql.exec("SELECT github_id FROM identities WHERE account_key = ?", accountKey).toArray().length >
  0;
