/**
 * The serial job queue and what a job runs against. `pending` counts jobs queued or running;
 * `wedged` says whether the running one has outlived its bound; `stop` drops the jobs not started
 * and waits up to `timeoutMs` for the running one, `true` if it ended idle.
 */
import type { JobSpec } from "@orbinum-ceremony/core";
import type { ServiceConfig } from "../config";
import type { Submission } from "../http";
import type { Inputs } from "../inputs";

export interface JobQueue {
  submit(spec: JobSpec): Submission;
  pending(): number;
  wedged(): boolean;
  stop(timeoutMs: number): Promise<boolean>;
}

export interface JobContext {
  config: ServiceConfig;
  inputs: Inputs;
}
