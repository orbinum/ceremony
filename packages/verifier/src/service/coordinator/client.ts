/**
 * The verifier's calls to the coordinator (COORDINATOR §5): HMAC-signed for the pinned ceremony,
 * no redirects, bounded in time and size, retried with jittered backoff until the job's deadline.
 */
import {
  INTERNAL_PATHS,
  type JobId,
  signedRequestInit,
  toPrintable,
  type VerifierReport,
} from "@orbinum-ceremony/core";
import { cappedToFile } from "../../files";
import type { ServiceConfig } from "../config";

/** What a call needs: the coordinator, the shared key, and the ceremony the MAC binds. */
export type Endpoint = Pick<ServiceConfig, "coordinatorUrl" | "hmacKey"> & { ceremonyId: string };

/** Bound on one request, response headers and body included. */
export const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Tries per call without a deadline. With one (every job's call), network errors, 5xx and 429 are
 * retried until it passes: a coordinator answering 503 for a while must not lose the result.
 */
export const MAX_ATTEMPTS = 5;
/** Longest wait between two tries. */
const MAX_BACKOFF_MS = 10_000;
/** How much of an error response is kept for the message. */
const MAX_ERROR_BODY_BYTES = 1024;

/** Backoff before try `i + 1`: 0.5 s doubling per try up to 10 s, jittered to 50–100 %. */
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

/** A thrown fetch error with its cause (undici hides the reason there). */
const describe = (error: unknown) => {
  const e = error as Error & { cause?: { message?: string } };
  return e.cause?.message ? `${e.message}: ${e.cause.message}` : String(e?.message ?? e);
};

/** One signed request; `signal` (the job's deadline) and the per-request timeout both abort it. */
function send(ep: Endpoint, method: string, path: string, body: string, signal?: AbortSignal) {
  const url = new URL(path, ep.coordinatorUrl);
  const init = signedRequestInit(ep.hmacKey, ep.ceremonyId, method, url, body, Date.now());
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    // identity: the length checked below is the raw byte count.
    headers: { ...(init.headers as Record<string, string>), "accept-encoding": "identity" },
    redirect: "error",
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
}

/**
 * `send`, retried on network errors, 5xx and 429 until `signal` aborts (without one, `MAX_ATTEMPTS`
 * tries); returns the first other response, or the last transient one when out of tries.
 */
/**
 * A failure of the moment, retried until the deadline: a server error, or a throttle (429), which
 * the coordinator answers before it judges the request at all.
 */
const transient = (status: number) => status >= 500 || status === 429;

async function request(
  ep: Endpoint,
  method: string,
  path: string,
  body: string,
  signal?: AbortSignal,
): Promise<Response> {
  const lastTry = (i: number) => (signal ? signal.aborted : i >= MAX_ATTEMPTS);
  for (let i = 1; ; i++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries are sequential by design
      const response = await send(ep, method, path, body, signal);
      if (!transient(response.status) || lastTry(i)) return response;
      // oxlint-disable-next-line no-await-in-loop -- releases the connection before retrying
      await response.body?.cancel();
    } catch (error) {
      if (lastTry(i)) {
        throw new Error(`${method} ${path}: ${describe(error)}`, { cause: error });
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- backoff between retries
    await pause(backoffMs(i), signal);
  }
}

/** The start of a response body as printable text; the rest is never read. */
async function cappedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_ERROR_BODY_BYTES) {
      // oxlint-disable-next-line no-await-in-loop -- reads one stream in order
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_BYTES));
  return toPrintable(text, MAX_ERROR_BODY_BYTES);
}

const refused = async (what: string, response: Response) =>
  new Error(`${what}: the coordinator answered ${response.status} ${await cappedText(response)}`);

/**
 * Streams the object of a pending job to `dest`, refusing anything but exactly `size` bytes.
 * `false` on 404: the coordinator no longer has it (a stale job), so there is nothing to report.
 */
export async function fetchObject(
  ep: Endpoint,
  job: JobId,
  size: number,
  dest: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await request(ep, "GET", INTERNAL_PATHS.object(job), "", signal);
  if (response.status === 404) {
    await response.body?.cancel();
    return false;
  }
  if (response.status !== 200 || !response.body) throw await refused("object fetch", response);
  if (response.headers.get("content-length") !== String(size)) {
    await response.body.cancel();
    throw new Error("object fetch: unexpected length");
  }
  if ((await cappedToFile(response.body, dest, size)) !== size) {
    throw new Error("object fetch: shorter than declared");
  }
  return true;
}

/**
 * Posts a result. Network errors, 5xx and 429 are retried until the deadline (the callback is
 * idempotent); any other 4xx is final: the coordinator refused the report itself, and repeating it
 * would not change that.
 */
export async function postReport(
  ep: Endpoint,
  report: VerifierReport,
  signal?: AbortSignal,
): Promise<void> {
  const body = JSON.stringify(report);
  const response = await request(ep, "POST", INTERNAL_PATHS.verifications, body, signal);
  if (!response.ok) throw await refused("report", response);
  await response.body?.cancel();
}
