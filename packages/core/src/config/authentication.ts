/**
 * Lifetimes and bounds of credentials.
 * - `LINK_RULES`: wallet-link nonce lifetime and size, and how far `issued_at` may be from the
 *   server clock.
 * - `SESSION_RULES`: how long a session cookie and an OAuth state live; a contributor's CLI token is
 *   short and never outlives the session it came from, and is minted with at least `cliTokenMinMs`
 *   (a session takes minutes).
 * - `REQUEST_AUTH`: the timestamp window of coordinator ↔ verifier requests.
 * - `MIN_KEY_BYTES`: the shortest secret any MAC is keyed with (request authentication, tokens).
 * - `LOOPBACK_HOSTS`: host names that reach only this machine; plaintext and development
 *   privileges are allowed only there.
 */
export const LINK_RULES = { nonceTtlMs: 10 * 60_000, nonceBytes: 32, maxSkewS: 10 * 60 } as const;

export const SESSION_RULES = {
  ttlMs: 12 * 60 * 60_000,
  oauthStateTtlMs: 10 * 60_000,
  cliTokenTtlMs: 6 * 60 * 60_000,
  cliTokenMinMs: 30 * 60_000,
} as const;

export const REQUEST_AUTH = { skewMs: 60_000 } as const;

export const MIN_KEY_BYTES = 32;

export const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];
