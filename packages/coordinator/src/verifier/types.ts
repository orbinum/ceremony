/**
 * A job the verifier container keeps until its deadline: its spec, the ceremony and the time it was
 * queued for, and the container start it was last posted to (its jobs live in that process's
 * memory); and a claimed turn's warm-up, for its ceremony.
 */
import type { JobSpec } from "@orbinum-ceremony/core";

export interface Queued {
  spec: JobSpec;
  ceremony: string;
  at: number;
  postedTo?: number;
}

export interface Warm {
  ceremony: string;
  at: number;
}
