/**
 * Waiting and retrying against the coordinator: transient failures (network, 429, 5xx) are tried
 * again with backoff for a while, a refused token ends the run at once.
 */
import { CoordinatorRefusal } from "../../io";

/** How long transient failures are retried, counted from the first one. */
const RETRY_FOR_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;

/** The coordinator no longer takes this token: the run cannot go on, nor end the session. */
export class TokenRefused extends Error {
  override readonly name = "TokenRefused";
}

/** Waits `ms`, or rejects at once if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("interrupted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(new Error("interrupted"));
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** A failure worth retrying: the network, a timeout, a rate limit, or the coordinator's fault. */
export const isTransient = (error: unknown) =>
  !(error instanceof CoordinatorRefusal) || error.status === 429 || error.status >= 500;

/** Whether `error` is the coordinator's answer `code`. */
export const refusedWith = (error: unknown, code: string) =>
  error instanceof CoordinatorRefusal && error.code === code;

/** A 401 as the error the run reports: the token, not the coordinator, is the problem. */
export const tokenChecked = (error: unknown) =>
  error instanceof CoordinatorRefusal && error.status === 401
    ? new TokenRefused("the CLI token was refused (expired?): create a new one in the browser")
    : error;

/** `call`, retried with backoff on transient failures for `RETRY_FOR_MS` after the first one. */
export async function retrying<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let deadline: number | undefined;
  for (let wait = 1000; ; wait = Math.min(2 * wait, MAX_BACKOFF_MS)) {
    try {
      return await call();
    } catch (error) {
      deadline ??= Date.now() + RETRY_FOR_MS;
      if (!isTransient(error) || Date.now() + wait > deadline || signal?.aborted) {
        throw tokenChecked(error);
      }
    }
    await sleep(wait, signal);
  }
}
