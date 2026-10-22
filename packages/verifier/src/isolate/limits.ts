/**
 * Bounds of one isolated task. Measured on the rehearsal circuits with the 2^16 ptau (three runs
 * each, Apple M-series): `newZKey` and `verifyFromR1cs` take ≤ 14 s, `verifyFromInit`,
 * `contribute` and `beacon` ≤ 6 s, `exportVerificationKey` ≤ 0.4 s; the largest peak RSS is
 * 895 MB (`verifyFromR1cs` on transfer, Apple M4, with core's wallet libraries loaded; 824 MB for
 * `verifyFromInit`). The bounds leave room for hardware 2–3× slower and for process start-up
 * (~1 s). KL-33.
 */

/** Wall time and resident memory one task may use. */
export interface Limits {
  timeoutMs: number;
  maxRssBytes: number;
}

/** Resident memory of any isolated task: ~2.3× the largest measured peak. */
export const MAX_RSS_BYTES = 2 * 1024 ** 3;

/** Per class of snarkjs operation. */
export const LIMITS = {
  /** Groth16 setup and full verification from r1cs. */
  heavy: { timeoutMs: 120_000, maxRssBytes: MAX_RSS_BYTES },
  /** One contribution, the beacon, and verification from the genesis. */
  medium: { timeoutMs: 60_000, maxRssBytes: MAX_RSS_BYTES },
  /** Reading the verification key out of a zkey. */
  light: { timeoutMs: 30_000, maxRssBytes: MAX_RSS_BYTES },
} as const satisfies Record<string, Limits>;
