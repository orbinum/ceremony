/**
 * One HMAC-signed request to the coordinator for the pinned ceremony, never following a redirect,
 * bounded by `REQUEST_TIMEOUT_MS` and by `signal` (the job's deadline). Network errors, 5xx and
 * 429 (a throttle, answered before the coordinator judges the request at all) are failures of the
 * moment: retried until `signal` aborts, or `MAX_ATTEMPTS` tries without one, with a backoff of
 * 0.5 s doubling per try up to 10 s, jittered to 50–100 %. Returns the first other response, or
 * the last transient one when out of tries. Asks for `identity` encoding, so the length a caller
 * checks is the raw byte count, and a thrown fetch error carries its cause, where undici hides
 * the reason.
 */
import { signedRequestInit } from "@orbinum-ceremony/core";
import { MAX_ATTEMPTS, REQUEST_TIMEOUT_MS } from "./constants";
import type { Endpoint } from "./types";

const MAX_BACKOFF_MS = 10_000;

const backoffMs = (i: number) =>
  Math.min(MAX_BACKOFF_MS, 500 * 2 ** (i - 1)) * (0.5 + Math.random() / 2);

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const done = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", done);
      resolve();
    }, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

const describe = (error: unknown) => {
  const e = error as Error & { cause?: { message?: string } };
  return e.cause?.message ? `${e.message}: ${e.cause.message}` : String(e?.message ?? e);
};

function send(ep: Endpoint, method: string, path: string, body: string, signal?: AbortSignal) {
  const url = new URL(path, ep.coordinatorUrl);
  const init = signedRequestInit(ep.hmacKey, ep.ceremonyId, method, url, body, Date.now());
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "accept-encoding": "identity" },
    redirect: "error",
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
}

const transient = (status: number) => status >= 500 || status === 429;

export async function retriedRequest(
  ep: Endpoint,
  method: string,
  path: string,
  body: string,
  signal?: AbortSignal,
): Promise<Response> {
  const lastTry = (i: number) => (signal ? signal.aborted : i >= MAX_ATTEMPTS);
  for (let i = 1; ; i++) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const response = await send(ep, method, path, body, signal);
      if (!transient(response.status) || lastTry(i)) return response;
      // oxlint-disable-next-line no-await-in-loop
      await response.body?.cancel();
    } catch (error) {
      if (lastTry(i)) {
        throw new Error(`${method} ${path}: ${describe(error)}`, { cause: error });
      }
    }
    // oxlint-disable-next-line no-await-in-loop
    await pause(backoffMs(i), signal);
  }
}
