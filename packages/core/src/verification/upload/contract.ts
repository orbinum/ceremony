/** The verifier's verdict on one upload (SPEC §2.5 result contract). */
import { CONTINUITY_FAILURES } from "./continuity";

/** Every definitive fault an upload can have. */
export const REJECT_REASONS = [
  "malformed",
  "malformed-claim",
  "output-hash-mismatch",
  "stale-head",
  ...CONTINUITY_FAILURES,
  "client-hash-mismatch",
  "zkey-verify-failed",
] as const;

/** A definitive fault in the upload. */
export type RejectReason = (typeof REJECT_REASONS)[number];

/** Verdict on one upload. */
export type VerificationResult =
  | { result: "valid"; index: number; contributionHash: string }
  /** Definitive fault in the upload: the turn is consumed. */
  | { result: "rejected"; reason: RejectReason; detail?: string }
  /**
   * The verifier could not decide: re-upload allowed, turn not consumed. Reserved: the current
   * verifier never returns it.
   */
  | { result: "ambiguous"; detail: string }
  /** Verifier error or timeout: the ceremony pauses, nobody is penalized. */
  | { result: "infra"; detail: string };

/** What `zkey verify` logs on success; a verification counts only with it (SPEC §2.5, A7). */
const ZKEY_OK_MARKER = "ZKey Ok!";

/** One line of a verify log, as the verifier records snarkjs' logger. */
export const logLine = (level: string, message: string): string => `[${level}] ${message}`;

/** snarkjs' answer counts only if it returned true **and** logged the success marker. */
export const zkeyVerifyPassed = (returned: boolean, log: string): boolean =>
  returned && log.includes(ZKEY_OK_MARKER);
