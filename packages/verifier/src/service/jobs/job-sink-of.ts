/**
 * The queue as the HTTP server's job sink: `/healthz` is healthy while pins hold and no job is
 * wedged.
 */
import type { JobSink } from "../http";
import type { Inputs } from "../inputs";
import type { JobQueue } from "./types";

export const jobSinkOf = (inputs: Inputs, queue: JobQueue): JobSink => ({
  submit: queue.submit,
  healthy: () => inputs.pinned && !queue.wedged(),
});
