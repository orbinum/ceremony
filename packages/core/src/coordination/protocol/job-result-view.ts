/**
 * What a contributor polls for an upload: `pending`, then the outcome (with the reason of a
 * rejection; never the verifier's free-text detail), or `stale` (it ended without a verdict: its
 * deadline passed, or the turn moved on). The uploaded hash lets a client whose upload answer was
 * lost recognise its own upload.
 */
import type { Job } from "./types";

export const jobResultView = (job: Job) => ({
  seq: job.seq,
  attempt: job.attempt,
  index: job.index,
  output_sha256: job.claim.outputSha256,
  status: job.status === "done" ? job.outcome : job.status,
  ...(job.report?.result === "rejected" ? { reason: job.report.reason } : {}),
});
