/**
 * A job the verifier container keeps until its deadline: its spec, when it was queued, and the
 * container start it was last posted to (its jobs live in that process's memory).
 */
import type { JobSpec } from "@orbinum-ceremony/core";

export interface Queued {
  spec: JobSpec;
  at: number;
  postedTo?: number;
}
