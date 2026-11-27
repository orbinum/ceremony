/**
 * Links a wallet, with the nonce and `issued_at` of the payload its signature signs. A new link of
 * the same GitHub account replaces only that account's own row, so a wallet another account holds
 * still fails on the UNIQUE `account_key`.
 */
import type { LinkedIdentity } from "@orbinum-ceremony/core";

export const writeIdentity = (sql: SqlStorage, id: LinkedIdentity) =>
  sql.exec(
    `INSERT INTO identities
       (github_id, login, scheme, account, account_key, signature, nonce, issued_at, linked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (github_id) DO UPDATE SET
       login = excluded.login, scheme = excluded.scheme, account = excluded.account,
       account_key = excluded.account_key, signature = excluded.signature,
       nonce = excluded.nonce, issued_at = excluded.issued_at, linked_at = excluded.linked_at`,
    id.githubId,
    id.login,
    id.scheme,
    id.account,
    id.accountKey,
    id.signature,
    id.nonce,
    id.issuedAt,
    id.linkedAt,
  );
