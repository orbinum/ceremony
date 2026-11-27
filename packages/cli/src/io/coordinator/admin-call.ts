/**
 * One call to the coordinator's operator API (`/admin/*`, behind Cloudflare Access), resolving with
 * the answer's fields once the coordinator said `ok: true`. Only to the configured origin, never
 * through a redirect: it would carry the Access secret elsewhere, and Access answers a refused token
 * with its login page, which must not read as success. A rate limit, a server-side failure or a
 * dropped socket (the request may not have reached the coordinator) is retried per `ADMIN_RETRY`;
 * a refusal, a redirect or the call's own timeout never is. Only idempotent calls may use it.
 */
import { OPERATOR_HEADER } from "@orbinum-ceremony/core";
import { accessHeaders } from "./access-headers";
import { answerOf } from "./answer-of";
import { ADMIN_RETRY, ADMIN_TIMEOUT_MS } from "../constants";
import { CoordinatorRefusal } from "./coordinator-refusal";

const TRANSIENT_SOCKET = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const isTransient = (error: unknown) =>
  error instanceof CoordinatorRefusal
    ? error.status === 429 || error.status >= 500
    : error instanceof TypeError &&
      TRANSIENT_SOCKET.has((error.cause as { code?: string } | undefined)?.code ?? "");

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
  const access = accessHeaders(origin, process.env);
  let res: Response;
  try {
    res = await fetch(`${origin}${path}`, {
      method,
      headers: { ...access, [OPERATOR_HEADER]: "1", ...headers },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
    });
  } catch (error) {
    const cause = (error as Error).cause;
    if (cause instanceof Error && cause.message === "unexpected redirect") {
      throw new Error(
        `${what}: redirected, as Cloudflare Access does when it refuses a call; ${
          Object.keys(access).length === 0
            ? "no service token was sent (set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET)"
            : "the service token in CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET was not let in"
        }`,
        { cause: error },
      );
    }
    throw error;
  }
  const answer = await answerOf(res, what, "not a JSON answer (a login page?)");
  if (answer.ok !== true) throw new Error(`${what}: the coordinator did not answer ok`);
  return answer;
}
