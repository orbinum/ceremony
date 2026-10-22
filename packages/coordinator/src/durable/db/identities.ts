/**
 * Linked wallets (1 GitHub = 1 wallet, by `account_key`) with the link payload they signed, and
 * the single-use link nonces. SPEC §3.4.
 */
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

/** The wallet linked to a GitHub identity, if any. */
export function readIdentity(sql: SqlStorage, githubId: number): LinkedIdentity | null {
  const row = sql
    .exec<IdentityRow>("SELECT * FROM identities WHERE github_id = ?", githubId)
    .toArray()[0];
  return row ? identityOf(row) : null;
}

/** Whether another identity holds this wallet key. */
export const walletTaken = (sql: SqlStorage, accountKey: string): boolean =>
  sql.exec("SELECT github_id FROM identities WHERE account_key = ?", accountKey).toArray().length >
  0;

/** Links a wallet, with the nonce and `issued_at` of the payload its signature signs. */
export const writeIdentity = (sql: SqlStorage, id: LinkedIdentity) =>
  sql.exec(
    `INSERT INTO identities
       (github_id, login, scheme, account, account_key, signature, nonce, issued_at, linked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

/** Live nonces kept per identity: a client never needs more than one or two in flight. */
const MAX_LIVE_NONCES = 5;

/** Stores a fresh nonce for `githubId`, purging expired ones and its oldest beyond the cap. */
export function insertNonce(
  sql: SqlStorage,
  nonce: string,
  githubId: number,
  now: number,
  expiresAt: number,
) {
  sql.exec("DELETE FROM nonces WHERE expires_at <= ?", now);
  sql.exec(
    `DELETE FROM nonces WHERE github_id = ? AND nonce NOT IN
       (SELECT nonce FROM nonces WHERE github_id = ? ORDER BY expires_at DESC, rowid DESC LIMIT ?)`,
    githubId,
    githubId,
    MAX_LIVE_NONCES - 1,
  );
  sql.exec(
    "INSERT INTO nonces (nonce, github_id, expires_at) VALUES (?, ?, ?)",
    nonce,
    githubId,
    expiresAt,
  );
}

/** Consumes a nonce of `githubId` that is still valid at `now`; false if there is none. */
export const consumeNonce = (sql: SqlStorage, nonce: string, githubId: number, now: number) =>
  sql
    .exec(
      "DELETE FROM nonces WHERE nonce = ? AND github_id = ? AND expires_at > ? RETURNING nonce",
      nonce,
      githubId,
      now,
    )
    .toArray().length > 0;
