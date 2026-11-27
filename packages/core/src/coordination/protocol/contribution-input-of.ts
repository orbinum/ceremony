/** The transcript record input of an accepted job: the claim, the report and the linked contributor. */
import type { ContributionInput, Identity } from "../../ceremony";
import type { JobId, JobSpec, VerifierReport } from "./types";

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
