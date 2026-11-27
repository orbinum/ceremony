/** A new pending job for an upload stored under `key`. */
import type { ContributionClaim, Job, JobId } from "../types";

export const newJob = (input: {
  job: JobId & { index: number };
  githubId: number;
  key: string;
  size: number;
  claim: ContributionClaim;
}): Job => ({ ...input.job, ...input, status: "pending", outcome: null, report: null });
