/**
 * The ways an upload can be refused: the continuity failures (it does not extend the recorded head)
 * and, around them, every definitive fault the verifier may report.
 */
export const CONTINUITY_FAILURES = [
  "cs-hash-mismatch",
  "wrong-count",
  "prefix-mismatch",
  "name-rewritten",
  "not-a-contribution",
  "bad-name",
  "noop-contribution",
] as const;

export const REJECT_REASONS = [
  "malformed",
  "malformed-claim",
  "output-hash-mismatch",
  "stale-head",
  ...CONTINUITY_FAILURES,
  "client-hash-mismatch",
  "zkey-verify-failed",
] as const;
