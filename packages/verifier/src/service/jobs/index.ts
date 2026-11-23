// verifier/service/jobs: a dispatched job, its attempt record, and the serial queue of them.
export { createQueue, type JobQueue, MAX_PENDING, SEEN_KEYS } from "./queue";
export { probeLogDir } from "./records";
export { JOB_DEADLINE_MS, runJob } from "./run-job";
export { jobSinkOf } from "./sink";
