/** Jobs on both sides of the wire: their names and keys, and their lifecycle. COORDINATOR §5. */
import type { CurrentHead } from "../../verification";
import type { ContributionClaim, Job, JobId, JobSpec } from "./types";

/** `seq/circuit/attempt`: the job's path under `/internal/objects/` and its dedupe key. */
export const jobKey = (job: JobId): string => `${job.seq}/${job.circuit}/${job.attempt}`;

/** Prefix of the private object of a job (a random suffix follows, per upload). */
export const jobObjectPrefix = (job: JobId): string =>
  `verify/${job.seq}/${job.circuit}/${job.attempt}-`;

/** Where the verifier keeps an attempt's record, under its log directory. */
export const attemptLogKey = (job: JobSpec["job"]): string =>
  `${job.circuit}/${job.index}-${job.seq}-${job.attempt}.log`;

/** The private object key of one upload of `job`. */
export const jobObjectKey = (job: JobId, suffix: string): string =>
  `${jobObjectPrefix(job)}${suffix}.zkey`;

/** Whether `key` is an object of exactly this job (the trailing `-` keeps `1-` from `10-`). */
export const isJobObjectKey = (job: JobId, key: string): boolean =>
  key.startsWith(jobObjectPrefix(job));

/** A new pending job for an upload stored under `key`. */
export const newJob = (input: {
  job: JobId & { index: number };
  githubId: number;
  key: string;
  size: number;
  claim: ContributionClaim;
}): Job => ({ ...input.job, ...input, status: "pending", outcome: null, report: null });

/** What the verifier needs for a job (`POST /verify`). */
export const jobSpecOf = (job: Job, head: CurrentHead, genesisSha256: string): JobSpec => ({
  job: { seq: job.seq, circuit: job.circuit, attempt: job.attempt, index: job.index },
  claim: job.claim,
  size: job.size,
  head: { outputSha256: head.outputSha256, csHash: head.csHash, previous: head.previous },
  genesisSha256,
});

/**
 * What a contributor polls for an upload: `pending`, then the outcome (with the reason of a
 * rejection; never the verifier's free-text detail), or `stale` (it ended without a verdict: its
 * deadline passed, or the turn moved on). The uploaded hash lets a client whose upload answer was
 * lost recognise its own upload.
 */
export const jobResultView = (job: Job) => ({
  seq: job.seq,
  attempt: job.attempt,
  index: job.index,
  output_sha256: job.claim.outputSha256,
  status: job.status === "done" ? job.outcome : job.status,
  ...(job.report?.result === "rejected" ? { reason: job.report.reason } : {}),
});
