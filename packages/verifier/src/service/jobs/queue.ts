/**
 * Dispatched jobs, run one at a time in arrival order, each attempt once, each stamped with when
 * it arrived (its deadline runs from there). COORDINATOR §5.
 */
import { jobKey, type JobSpec, sha256Utf8 } from "@orbinum-ceremony/core";
import { errorMessage } from "../../text";
import type { Submission } from "../http";

/** Recent job keys kept for dedupe: a repeated dispatch is a retry of a recent one. */
export const SEEN_KEYS = 1024;

/**
 * Jobs queued or running at most. The coordinator verifies one upload at a time, so a longer
 * line is a stale backlog: refusing it keeps fresh work from waiting behind expired work.
 */
export const MAX_PENDING = 32;

/** A serial FIFO of jobs. */
export interface JobQueue {
  submit(spec: JobSpec): Submission;
  /** Jobs queued or running. */
  pending(): number;
  /** Whether the running job has outlived `maxRunMs`. */
  wedged(): boolean;
  /** Drops the jobs not started and waits up to `timeoutMs` for the running one; `true` if idle. */
  stop(timeoutMs: number): Promise<boolean>;
}

/** A queue running `run` per job; a job that throws is logged and the next one still runs. */
export function createQueue(
  run: (spec: JobSpec, receivedAt: number) => Promise<void>,
  maxRunMs: number,
): JobQueue {
  /** Job key → digest of the spec first dispatched under it. */
  const seen = new Map<string, string>();
  let tail = Promise.resolve();
  let pending = 0;
  let startedAt: number | undefined;
  let stopped = false;

  const step = async (spec: JobSpec, receivedAt: number) => {
    if (stopped) return;
    startedAt = Date.now();
    await run(spec, receivedAt);
  };

  return {
    submit(spec) {
      const key = jobKey(spec.job);
      const digest = sha256Utf8(JSON.stringify(spec));
      const first = seen.get(key);
      if (first !== undefined) return first === digest ? "duplicate" : "conflict";
      if (pending >= MAX_PENDING) return "full";
      seen.set(key, digest);
      if (seen.size > SEEN_KEYS) seen.delete(seen.keys().next().value as string);
      pending += 1;
      const receivedAt = Date.now();
      tail = tail
        .then(() => step(spec, receivedAt))
        .catch((error: unknown) => console.error(`job ${key}: ${errorMessage(error)}`))
        .finally(() => {
          startedAt = undefined;
          pending -= 1;
        });
      return "queued";
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
