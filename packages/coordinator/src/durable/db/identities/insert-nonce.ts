/**
 * Stores a fresh single-use link nonce for an identity, purging expired ones and its oldest beyond
 * five live nonces: a client never needs more than one or two in flight.
 */
const MAX_LIVE_NONCES = 5;

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
