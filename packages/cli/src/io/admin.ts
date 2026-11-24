/**
 * The coordinator's operator API (`/admin/*`, behind Cloudflare Access), as `publish-init` and
 * `publish-final` use it. Only to the configured origin, never through a redirect (which would
 * carry the Access secret elsewhere or turn a login page into a success), and an answer counts
 * only if it is the coordinator's own `{ ok: true }`. Every call they make is idempotent (the same
 * file again is `unchanged`, the same setup again is configured, a sealed ceremony is checked by
 * the caller), so one lost to the network or the coordinator's fault is sent again. COORDINATOR §3.
 */
import {
  ADMIN_PATHS,
  CONTENT_SHA256_HEADER,
  fromUtf8,
  OPERATOR_HEADER,
  parseJsonText,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { answerOf, CoordinatorRefusal, publicGet } from "./answer";

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

/**
 * A Cloudflare Access service token, from the environment, for an `https:` origin only: over
 * plaintext (a local coordinator) it would reach whatever listens on that port.
 */
export function accessHeaders(origin: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  if (new URL(origin).protocol !== "https:" || !id || !secret) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}

/**
 * Worth another attempt: a rate limit or a server-side failure, or a dropped socket. Never a
 * refusal, a redirect (also a `TypeError`) or the call's own timeout.
 */
const isTransient = (error: unknown) =>
  error instanceof CoordinatorRefusal
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
      return await adminCallOnce(origin, method, path, headers, body);
    } catch (error) {
      if (attempt >= retry.attempts || !isTransient(error)) throw error;
      console.error(`${method} ${path}: ${(error as Error).message}; trying again`);
    }
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
  const answer = await answerOf(res, what, "not a JSON answer (a login page?)");
  if (answer.ok !== true) throw new Error(`${what}: the coordinator did not answer ok`);
  return answer;
}

/** Publishes one file at `key`, hash-checked by the bucket; the coordinator must store that key. */
export async function publishArtifact(origin: string, key: string, bytes: Uint8Array) {
  const answer = await adminCall(
    origin,
    "PUT",
    ADMIN_PATHS.artifact(key),
    { [CONTENT_SHA256_HEADER]: sha256Hex(bytes) },
    bytes,
  );
  if (answer.key !== key) throw new Error(`PUT ${key}: the coordinator stored another key`);
}

/** Posts `value` as JSON to an admin path. */
export const postJson = (origin: string, path: string, value: unknown) =>
  adminCall(origin, "POST", path, { "content-type": "application/json" }, JSON.stringify(value));

/** A public document the coordinator serves (no credentials, no redirect), as JSON. */
export async function publicJson(origin: string, path: string, maxBytes: number): Promise<unknown> {
  const bytes = await publicGet(origin, path, maxBytes, TIMEOUT_MS);
  return parseJsonText(fromUtf8(bytes), `GET ${path}`);
}
