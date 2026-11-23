/** Waiting, and trying again what failed only for a moment (the network, the coordinator). */
import { isTransient } from "../api";

/** How long transient failures are retried, counted from the first one. */
const RETRY_FOR_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;

/** Waits `ms`. Injected where time matters, so the tests do not wait. */
export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `call`, retried with backoff on transient failures for a minute after the first one. */
export async function retrying<T>(call: () => Promise<T>, wait: Sleep = sleep): Promise<T> {
  let deadline: number | undefined;
  for (let backoff = 1000; ; backoff = Math.min(2 * backoff, MAX_BACKOFF_MS)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt after the other, with backoff
      return await call();
    } catch (error) {
      deadline ??= Date.now() + RETRY_FOR_MS;
      if (!isTransient(error) || Date.now() + backoff > deadline) throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- backoff between attempts
    await wait(backoff);
  }
}
