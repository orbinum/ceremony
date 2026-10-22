/** Dispatched jobs, run one at a time in arrival order, each attempt once. COORDINATOR §5. */
import { jobKey, type JobSpec } from "@orbinum-ceremony/core";
import { errorMessage } from "../../text";

/** Recent job keys kept for dedupe: a repeated dispatch is a retry of a recent one. */
export const SEEN_KEYS = 1024;

/** A serial FIFO of jobs. */
export interface JobQueue {
  /** Queues a job; `false` when the same attempt was already taken. */
  submit(spec: JobSpec): boolean;
  /** Jobs queued or running. */
  pending(): number;
  /** Whether the running job has outlived `maxRunMs`. */
  wedged(): boolean;
  /** Drops the jobs not started and waits up to `timeoutMs` for the running one; `true` if idle. */
  stop(timeoutMs: number): Promise<boolean>;
}

/** A queue running `run` per job; a job that throws is logged and the next one still runs. */
export function createQueue(run: (spec: JobSpec) => Promise<void>, maxRunMs: number): JobQueue {
  const seen = new Set<string>();
  let tail = Promise.resolve();
  let pending = 0;
  let startedAt: number | undefined;
  let stopped = false;

  const step = async (spec: JobSpec) => {
    if (stopped) return;
    startedAt = Date.now();
    await run(spec);
  };

  return {
    submit(spec) {
      const key = jobKey(spec.job);
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > SEEN_KEYS) seen.delete(seen.values().next().value as string);
      pending += 1;
      tail = tail
        .then(() => step(spec))
        .catch((error: unknown) => console.error(`job ${key}: ${errorMessage(error)}`))
        .finally(() => {
          startedAt = undefined;
          pending -= 1;
        });
      return true;
    },
    pending: () => pending,
    wedged: () => startedAt !== undefined && Date.now() - startedAt > maxRunMs,
    async stop(timeoutMs) {
      stopped = true;
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<boolean>((r) => (timer = setTimeout(() => r(false), timeoutMs)));
      try {
        return await Promise.race([tail.then(() => true), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
