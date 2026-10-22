/**
 * The verifier's report on a job: what it establishes, how the coordinator reconciles it with the
 * job, and the record input of an accepted one. SPEC §2.5, COORDINATOR §5.
 */
import { MAX_DETAIL_CHARS, MAX_LOG_CHARS, TOOLING } from "../../config";
import type { ContributionInput, Identity } from "../../ceremony";
import { sha256Utf8 } from "../../primitives/hashing";
import { toLogText, toPrintable } from "../../primitives/schema";
import type { VerificationResult } from "../../verification";
import type { JobId, JobSpec, StoredReport, VerifierReport } from "./types";

/**
 * The outcome a report stands for. A `valid` that contradicts the job — another index, another
 * h_k than the client claimed, or a log that is not the hashed one — is the verifier's fault:
 * `infra` (nobody penalized), never an acceptance.
 */
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

/** A verify log as it is published and hashed: printable text, bounded. */
export const publishedLogOf = (rawLog: string): string => toLogText(rawLog, MAX_LOG_CHARS);

/**
 * The verifier's own record of one attempt (operator-only): the job, the verdict, timings, the log.
 */
export const verifierLogOf = (
  job: JobSpec["job"],
  verdict: VerificationResult,
  ms: Record<string, number | undefined>,
  log: string,
): string => `${JSON.stringify({ job, verdict, ms })}\n${log}\n`;

/**
 * What the verifier established for a job, as it reports it: free text made printable and
 * bounded, the log hashed exactly as it is sent.
 */
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
        // The index the bytes carry: the coordinator refuses one that contradicts the job.
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

/** The record input of an accepted job: the claim, the report and the linked contributor. */
export function contributionInputOf(input: {
  ceremonyId: string;
  job: JobId & { index: number; claim: JobSpec["claim"] };
  report: Extract<VerifierReport, { result: "valid" }>;
  contributor: (Identity & { linkSignature: string }) | null;
  at: string;
}): ContributionInput {
  const { job, report } = input;
  return {
    ceremonyId: input.ceremonyId,
    seq: job.seq,
    circuit: job.circuit,
    index: job.index,
    claimed: job.claim,
    verified: {
      contributionHash: report.contributionHash,
      zkeyName: report.zkeyName,
      deltaAfter: report.deltaAfter,
      logSha256: report.logSha256,
      verifierVersion: report.verifierVersion,
      snarkjsVersion: report.snarkjsVersion,
    },
    contributor: input.contributor,
    at: input.at,
  };
}

/** A report as a job keeps it: everything but the log. */
export function storedReport(report: VerifierReport): StoredReport {
  if (report.result !== "valid") return report;
  const { log: _log, ...kept } = report;
  return kept;
}
