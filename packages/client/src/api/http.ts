/**
 * Requests to the coordinator, on this origin with the session cookie. Its refusals
 * (`{ error: { code, message } }`) become `ApiError`; anything else non-2xx too, as `internal`.
 *
 * Answers are typed, not validated: the coordinator also serves this code, so a page that doubted
 * its answers could not doubt the code reading them (SPEC §7, malicious client JS). What the
 * contribution relies on is checked anyway, by core's own checks (`contribution/checks.ts`).
 */
import type { ApiErrorCode } from "@orbinum-ceremony/core";

/** A coordinator refusal or failure. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A failure worth trying again: the network, a rate limit, or the coordinator's own fault. */
export const isTransient = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 429 || error.status >= 500;

async function answerOf<T>(r: Response): Promise<T> {
  const json: unknown = await r.json().catch(() => null);
  if (r.ok) return json as T;
  const error = (json as { error?: { code?: ApiErrorCode; message?: string } } | null)?.error;
  throw new ApiError(r.status, error?.code ?? "internal", error?.message ?? r.statusText);
}

/** A JSON request (a body, if any, is sent as JSON); resolves with the JSON answer. */
export async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json", ...headers };
    init.body = JSON.stringify(body);
  }
  return answerOf<T>(await fetch(path, init));
}

/** A `PUT` of raw bytes; resolves with the JSON answer. */
export async function putBytes<T>(
  path: string,
  bytes: Uint8Array,
  headers: Record<string, string>,
): Promise<T> {
  return answerOf<T>(
    await fetch(path, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/octet-stream", ...headers },
      body: bytes as Uint8Array<ArrayBuffer>,
    }),
  );
}

/** A public file's bytes (`/artifacts/…`), or an `ApiError` if it is not there. */
export async function getBytes(path: string): Promise<Uint8Array> {
  // Revalidated: a stale copy (a leftover the coordinator replaced) would fail its hash check and
  // end the turn.
  const r = await fetch(path, { credentials: "same-origin", cache: "no-cache" });
  if (!r.ok) await answerOf(r);
  return new Uint8Array(await r.arrayBuffer());
}
