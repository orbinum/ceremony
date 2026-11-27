/** Consumes an identity's link nonce that is still valid at `now`; false if there is none. */
export const consumeNonce = (sql: SqlStorage, nonce: string, githubId: number, now: number) =>
  sql
    .exec(
      "DELETE FROM nonces WHERE nonce = ? AND github_id = ? AND expires_at > ? RETURNING nonce",
      nonce,
      githubId,
      now,
    )
    .toArray().length > 0;
