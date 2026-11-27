/**
 * `call`, retried with backoff while it fails only for a moment (the network, the coordinator), for
 * a minute after the first failure; one attempt after the other.
 */
import { isTransient } from "../../api";
import { MAX_BACKOFF_MS, RETRY_FOR_MS } from "../constants";
import type { Sleep } from "../types";
import { sleep } from "./sleep";

export async function retrying<T>(call: () => Promise<T>, wait: Sleep = sleep): Promise<T> {
  let deadline: number | undefined;
  for (let backoff = 1000; ; backoff = Math.min(2 * backoff, MAX_BACKOFF_MS)) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await call();
    } catch (error) {
      deadline ??= Date.now() + RETRY_FOR_MS;
      if (!isTransient(error) || Date.now() + backoff > deadline) throw error;
    }
    // oxlint-disable-next-line no-await-in-loop
    await wait(backoff);
  }
}
