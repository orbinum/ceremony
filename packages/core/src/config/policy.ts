/** Ceremony policy: the numbers SPEC fixes, kept apart from the cryptographic pins. */

/** Mainnet ceremonies need at least this many contributions per circuit. SPEC §6.2. */
export const MAINNET_MIN_CONTRIBUTIONS = 50;

/**
 * Each contribution grows a zkey by 394 B plus its name (≤ 255 B): an upload of contribution k is
 * at most size(genesis) + this × k. SPEC §2.5, A9.
 */
export const BYTES_PER_CONTRIBUTION = 1024;

/**
 * How long the verifier has for one upload. An upload made before the close may be accepted up to
 * this long after it, so the contribution window ends at close + this. SPEC §4.2–4.3.
 */
export const VERIFY_DEADLINE_MS = 5 * 60_000;

/**
 * The verifier service's bound on one upload's verification: below the coordinator's deadline, so
 * a slow check ends as `infra` there first; and not so low that an honest upload cannot finish.
 */
export const VERIFIER_TIMEOUT_MS = { min: 10_000, max: VERIFY_DEADLINE_MS - 30_000 } as const;

/**
 * Kept back from the verifier's bound on one job, so its report still lands within the deadline.
 */
export const REPORT_RESERVE_MS = 15_000;

/**
 * Wallet link: nonce lifetime and size, and how far `issued_at` may be from the server clock.
 * SPEC §3.4.
 */
export const LINK_RULES = { nonceTtlMs: 10 * 60_000, nonceBytes: 32, maxSkewS: 10 * 60 } as const;

/** Sign-in: how long a session cookie and an OAuth state live. SPEC §3.2. */
export const SESSION_RULES = {
  ttlMs: 12 * 60 * 60_000,
  oauthStateTtlMs: 10 * 60_000,
  /** A contributor's CLI token (SPEC §4.4): short, and never past the session it came from. */
  cliTokenTtlMs: 6 * 60 * 60_000,
  /** Shortest life a CLI token is minted with, and the CLI starts with: a session takes minutes. */
  cliTokenMinMs: 30 * 60_000,
} as const;

/** Coordinator ↔ verifier requests: the timestamp window. COORDINATOR §5. */
export const REQUEST_AUTH = { skewMs: 60_000 } as const;

/** Shortest secret any MAC is keyed with: request authentication and signed tokens. */
export const MIN_KEY_BYTES = 32;

/**
 * Networks whose transcript may hold simulated contributions (`contribute-local`): rehearsals.
 * A mainnet transcript with one is not a ceremony. SPEC §6.3.
 */
export const SIMULATED_NETWORKS: readonly string[] = ["local", "testnet"];

/** Default delay between close and the beacon round. SPEC §5.2. */
export const DEFAULT_BEACON_DELAY_SECONDS = 86_400;

/** Largest delay between close and the beacon round. */
export const MAX_BEACON_DELAY_SECONDS = 365 * 86_400;

/**
 * Shortest delay between close and the beacon time, per network: past the last possible
 * acceptance (close + the verify deadline), and a full day on mainnet. SPEC §5.2.
 */
export const MIN_BEACON_DELAY_SECONDS = {
  local: 0,
  testnet: VERIFY_DEADLINE_MS / 1000,
  mainnet: 86_400,
} as const;

/** Relays that must agree on a drand round before it is sealed. SPEC §5.4. */
export const MIN_RELAYS = 2;

/** GitHub admission thresholds (anti-sybil, not a cryptographic assumption). SPEC §3.2. */
export const GITHUB_THRESHOLDS = {
  minAgeDays: 30,
  minPublicRepos: 1,
  minFollowers: 1,
  minFollowing: 5,
} as const;

/** Host names that reach only this machine: plaintext and development privileges only there. */
export const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The circuits the session and verifier bounds were measured for (circuits v0.17.1: 3 circuits,
 * 52,226 constraints, the largest 34,200), with a margin: a ceremony past it must have the active
 * cap, the snarkjs bounds and the container re-measured first (KL-61).
 */
export const MEASURED_CIRCUITS = { maxTotalConstraints: 60_000, maxConstraints: 40_000 } as const;

/** The session queue's timers and limits, in milliseconds. SPEC §4.2. */
export const QUEUE_RULES = {
  claimWindowMs: 30_000,
  heartbeatMs: 30_000,
  missedHeartbeats: 3,
  activeCapMs: 20 * 60_000,
  noShowsForCooldown: 2,
  cooldownMs: 15 * 60_000,
  verifyDeadlineMs: VERIFY_DEADLINE_MS,
  maxRejected: 3,
  attemptsPerCircuit: 2,
  infraPerSession: 2,
  maxInfraResults: 6,
} as const;
