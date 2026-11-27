/**
 * One call on a contributor path with the CLI token: only to the configured origin, never through a
 * redirect (which would carry the token elsewhere), every answer bounded. Resolves with the
 * answer's JSON object, rejects with a `CoordinatorRefusal` for any non-2xx answer; `signal`
 * aborts it (an interrupted run) besides its own timeout.
 */
import { answerOf } from "./answer-of";
import type { Contributor } from "./types";

const TIMEOUT_MS = 60_000;

export async function contributorCall(
  who: Contributor,
  method: "GET" | "POST" | "PUT",
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: Uint8Array;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${who.origin}${path}`, {
    method,
    headers: { ...init.headers, authorization: `Bearer ${who.token}` },
    ...(init.body ? { body: init.body } : {}),
    redirect: "error",
    signal: AbortSignal.any([
      AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      ...(init.signal ? [init.signal] : []),
    ]),
  });
  return answerOf(res, `${method} ${path}`);
}
