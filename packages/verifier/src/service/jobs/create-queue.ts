/**
 * Dispatched jobs, run one at a time in arrival order, each attempt once, each stamped with when it
 * arrived (its deadline runs from there). A job that throws is logged and the next one still runs.
 * Each job key remembers the digest of the spec first dispatched under it: the same spec again is
 * a `duplicate`, another one a `conflict`.
 */
import { jobKey, type JobSpec, sha256Utf8 } from "@orbinum-ceremony/core";
import { errorMessage } from "../../text";
import { MAX_PENDING, SEEN_KEYS } from "./constants";
import type { JobQueue } from "./types";

export function createQueue(
  run: (spec: JobSpec, receivedAt: number) => Promise<void>,
  maxRunMs: number,
): JobQueue {
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
