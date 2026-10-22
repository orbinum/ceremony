/** What the HTTP server hands jobs to: the queue, healthy while pins hold and no job is wedged. */
import type { JobSink } from "../http";
import type { Inputs } from "../inputs";
import type { JobQueue } from "./queue";

/** The queue as the server's job sink; `/healthz` reports `healthy`. */
export const jobSinkOf = (inputs: Inputs, queue: JobQueue): JobSink => ({
  submit: queue.submit,
  healthy: () => inputs.pinned && !queue.wedged(),
});
