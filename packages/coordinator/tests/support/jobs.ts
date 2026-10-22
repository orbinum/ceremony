/** Uploads and verifier reports as the tests build them. */
import { type ContributionClaim, sha256Hex, type VerifierReport } from "@orbinum-ceremony/core";

/** A claim for `bytes` extending `input`. */
export const claimOf = (
  bytes: Uint8Array,
  input: string,
  hash = "ab".repeat(64),
): ContributionClaim => ({
  inputSha256: input,
  outputSha256: sha256Hex(bytes),
  contributionHash: hash,
  method: "cli",
  client: { name: "orbinum-ceremony", version: "0.1.0", commit: "abc1234" },
});

/** The verify log of a valid report. */
export const LOG = "[info] ZKey Ok!";

/** A valid report for `job`, the claim's h_k and a verify log. */
export const validReport = (
  job: VerifierReport["job"],
  contributionHash = "ab".repeat(64),
  log = LOG,
): VerifierReport => ({
  job,
  result: "valid",
  contributionHash,
  zkeyName: "alice",
  deltaAfter: "cd".repeat(64),
  logSha256: sha256Hex(new TextEncoder().encode(log)),
  log,
  verifierVersion: "0.1.0",
  snarkjsVersion: "0.7.6",
});
