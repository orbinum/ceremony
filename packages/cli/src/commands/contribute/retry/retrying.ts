/**
 * `call`, retried with backoff on transient failures (network, 429, 5xx) for a while counted from
 * the first one; any other failure, or a refused token, ends it at once.
 */
import { isTransient } from "./is-transient";
import { sleep } from "./sleep";
import { tokenChecked } from "./token-checked";

const RETRY_FOR_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;

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
