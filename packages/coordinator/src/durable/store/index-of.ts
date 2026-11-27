/** The public index a job writes (`circuit/index`), as the key of its promotion lock. */
import type { Job } from "@orbinum-ceremony/core";

export const indexOf = (job: Job): string => `${job.circuit}/${job.index}`;
