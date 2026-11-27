/** The wallet linked to a GitHub identity, if any, with the link payload's nonce and `issued_at`. */
import type { LinkedIdentity } from "@orbinum-ceremony/core";

type IdentityRow = {
  github_id: number;
  login: string;
  scheme: LinkedIdentity["scheme"];
  account: string;
  account_key: string;
  signature: string;
  nonce: string;
  issued_at: number;
  linked_at: number;
};

const identityOf = (row: IdentityRow): LinkedIdentity => ({
  githubId: row.github_id,
  login: row.login,
  scheme: row.scheme,
  account: row.account,
  accountKey: row.account_key,
  signature: row.signature,
  nonce: row.nonce,
  issuedAt: row.issued_at,
  linkedAt: row.linked_at,
});

export function readIdentity(sql: SqlStorage, githubId: number): LinkedIdentity | null {
  const row = sql
    .exec<IdentityRow>("SELECT * FROM identities WHERE github_id = ?", githubId)
    .toArray()[0];
  return row ? identityOf(row) : null;
}
