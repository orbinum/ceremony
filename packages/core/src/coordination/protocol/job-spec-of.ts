/** What the verifier needs for a job (`POST /verify`): everything besides the uploaded bytes. */
import type { CurrentHead } from "../../verification";
import type { Job, JobSpec } from "./types";

export const jobSpecOf = (job: Job, head: CurrentHead, genesisSha256: string): JobSpec => ({
  job: { seq: job.seq, circuit: job.circuit, attempt: job.attempt, index: job.index },
  claim: job.claim,
  size: job.size,
  head: { outputSha256: head.outputSha256, csHash: head.csHash, previous: head.previous },
  genesisSha256,
});
