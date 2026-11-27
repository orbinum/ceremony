/**
 * A JSON request to the coordinator, on this origin with the session cookie; a body, if any, is
 * sent as JSON. Resolves with the JSON answer, typed and not validated (see `types.ts`).
 */
import { answerOf } from "./answer-of";

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
