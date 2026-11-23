/**
 * The coordinator's operator API (`/admin/*`, behind Cloudflare Access), as `publish-init` and
 * `publish-final` use it. Only to the configured origin, never through a redirect (which would
 * carry the Access secret elsewhere or turn a login page into a success), and an answer counts
 * only if it is the coordinator's own `{ ok: true }`. Every call they make is idempotent (the same
 * file again is `unchanged`, the same setup again is configured, a sealed ceremony is checked by
 * the caller), so one lost to the network or the coordinator's fault is sent again. COORDINATOR §3.
 */
import {
  asObject,
  fromUtf8,
  OPERATOR_HEADER,
  parseJsonText,
  stripControl,
} from "@orbinum-ceremony/core";
import { readCapped } from "./http";

const TIMEOUT_MS = 10 * 60_000;
/** Attempts of one call, and the wait before the second (doubled before each next one). */
export const ADMIN_RETRY = { attempts: 3, backoffMs: 2_000 };
/** Socket failures after which the request may not have reached the coordinator. */
const TRANSIENT_SOCKET = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 512;

/**
 * A Cloudflare Access service token, from the environment, for an `https:` origin only: over
 * plaintext (a local coordinator, KL-29) it would reach whatever listens on that port.
 */
export function accessHeaders(origin: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  if (new URL(origin).protocol !== "https:" || !id || !secret) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}

/** A refusal answered by the coordinator: its HTTP status and error code (core's codes). */
export class AdminRefusal extends Error {
  override readonly name = "AdminRefusal";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/** The `error.code` of a refusal body, if it has one. */
function codeOf(text: string): string | undefined {
  try {
    const code = (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Worth another attempt: a rate limit or a server-side failure, or a dropped socket. Never a
 * refusal, a redirect (also a `TypeError`) or the call's own timeout.
 */
const isTransient = (error: unknown) =>
  error instanceof AdminRefusal
    ? error.status === 429 || error.status >= 500
    : error instanceof TypeError &&
      TRANSIENT_SOCKET.has((error.cause as { code?: string } | undefined)?.code ?? "");

/**
 * One admin call; resolves with the answer's fields once the coordinator said `ok: true`.
 * Transient failures are retried (`ADMIN_RETRY`); only idempotent calls may use it.
 */
export async function adminCall(
  origin: string,
  method: "PUT" | "POST",
  path: string,
  headers: Record<string, string>,
  body: Uint8Array | string,
  retry = ADMIN_RETRY,
): Promise<Record<string, unknown>> {
  for (let attempt = 1, wait = retry.backoffMs; ; attempt++, wait *= 2) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt after the other, with backoff
      return await adminCallOnce(origin, method, path, headers, body);
    } catch (error) {
      if (attempt >= retry.attempts || !isTransient(error)) throw error;
      console.error(`${method} ${path}: ${(error as Error).message}; trying again`);
    }
    // oxlint-disable-next-line no-await-in-loop -- backoff between attempts
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function adminCallOnce(
  origin: string,
  method: "PUT" | "POST",
  path: string,
  headers: Record<string, string>,
  body: Uint8Array | string,
): Promise<Record<string, unknown>> {
  const what = `${method} ${path}`;
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { ...accessHeaders(origin, process.env), [OPERATOR_HEADER]: "1", ...headers },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = fromUtf8(await readCapped(res, MAX_ANSWER_BYTES, what));
  if (!res.ok) {
    throw new AdminRefusal(
      `${what}: ${res.status} ${stripControl(text).replace(/\s+/g, " ").slice(0, MAX_ERROR_CHARS)}`,
      res.status,
      codeOf(text),
    );
  }
  if (!res.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error(`${what}: ${res.status} but not a JSON answer (a login page?)`);
  }
  const answer = asObject(parseJsonText(text, what), what);
  if (answer.ok !== true) throw new Error(`${what}: the coordinator did not answer ok`);
  return answer;
}

/** A public document the coordinator serves (no credentials, no redirect), as JSON. */
export async function publicJson(origin: string, path: string, maxBytes: number): Promise<unknown> {
  const res = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
  return parseJsonText(fromUtf8(await readCapped(res, maxBytes, `GET ${path}`)), `GET ${path}`);
}
