/**
 * What the verifier established for a job, as it reports it: free text made printable and bounded,
 * the log hashed exactly as it is sent. A valid report carries the index the bytes carry, so the
 * coordinator refuses one that contradicts the job.
 */
import { MAX_DETAIL_CHARS, TOOLING } from "../../../config";
import { sha256Utf8 } from "../../../primitives/hashing";
import { toPrintable } from "../../../primitives/schema";
import type { VerificationResult } from "../../../verification";
import { publishedLogOf } from "./published-log-of";
import type { JobSpec, VerifierReport } from "../types";

export function reportOf(
  spec: JobSpec,
  verdict: VerificationResult,
  accepted: { name: string; deltaAfter: string } | undefined,
  rawLog: string,
  verifierVersion: string,
): VerifierReport {
  const log = publishedLogOf(rawLog);
  switch (verdict.result) {
    case "valid":
      return {
        job: { ...spec.job, index: verdict.index },
        result: "valid",
        contributionHash: verdict.contributionHash,
        zkeyName: accepted?.name ?? "",
        deltaAfter: accepted?.deltaAfter ?? "",
        logSha256: sha256Utf8(log),
        log,
        verifierVersion,
        snarkjsVersion: TOOLING.snarkjs,
      };
    case "rejected":
      return {
        job: spec.job,
        result: "rejected",
        reason: verdict.reason,
        ...(verdict.detail ? { detail: toPrintable(verdict.detail, MAX_DETAIL_CHARS) } : {}),
      };
    default:
      return {
        job: spec.job,
        result: verdict.result,
        detail: toPrintable(verdict.detail, MAX_DETAIL_CHARS),
      };
  }
}
