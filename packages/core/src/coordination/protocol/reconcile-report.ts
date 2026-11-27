/**
 * The outcome a verifier report stands for. A `valid` that contradicts the job (another index,
 * another contribution hash than the client claimed, or a log that is not the hashed one) is the
 * verifier's fault: `infra`, nobody penalized, never an acceptance.
 */
import { sha256Utf8 } from "../../primitives/hashing";
import type { VerificationResult } from "../../verification";
import type { VerifierReport } from "./types";

export function reconcileReport(
  job: { index: number; claim: { contributionHash: string } },
  report: VerifierReport,
): VerificationResult["result"] {
  if (report.job.index !== job.index) return "infra";
  if (report.result !== "valid") return report.result;
  if (report.contributionHash !== job.claim.contributionHash) return "infra";
  if (sha256Utf8(report.log) !== report.logSha256) return "infra";
  return "valid";
}
