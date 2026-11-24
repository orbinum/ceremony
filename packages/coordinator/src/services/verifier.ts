/**
 * Hands a job to the verifier, signed for this ceremony (HMAC), expecting 202. Two ways:
 * `VERIFIER_URL` (`POST <url>/verify`, with the Access service token of its Tunnel when one is set,
 * KL-45), or else the `VERIFIER_CONTAINER` Durable Object, which starts the container and posts it
 * there. A redirect is never followed (`manual`; workerd has no `error` mode) and counts as a
 * failure. A failed dispatch is only logged: the verify deadline turns the silence into `infra`.
 * COORDINATOR §5.
 */
import { type JobSpec, signedRequestInit, VERIFIER_PATHS } from "@orbinum-ceremony/core";

const TIMEOUT_MS = 30_000;

/** The Access service token for the verifier, over https only (never to a local plain-http one). */
function accessHeaders(env: Env, url: URL): Record<string, string> {
  const id = env.VERIFIER_ACCESS_CLIENT_ID;
  const secret = env.VERIFIER_ACCESS_CLIENT_SECRET;
  if (url.protocol !== "https:" || !id || !secret) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}

/** Posts `spec` to `<base>/verify` through `send`, signed; the verifier's status. Throws on I/O. */
export async function postJob(
  env: Env,
  send: (url: URL, init: RequestInit) => Promise<Response>,
  base: string,
  spec: JobSpec,
): Promise<number> {
  const url = new URL(VERIFIER_PATHS.verify, base);
  const body = JSON.stringify(spec);
  const init = signedRequestInit(
    env.VERIFIER_HMAC_KEY,
    env.CEREMONY_ID,
    "POST",
    url,
    body,
    Date.now(),
  );
  const response = await send(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...accessHeaders(env, url) },
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Nothing in the answer is read: release it.
  await response.body?.cancel();
  return response.status;
}

/** Dispatches `spec`; never throws. */
export async function dispatch(env: Env, spec: JobSpec): Promise<void> {
  try {
    if (env.VERIFIER_URL) {
      const status = await postJob(env, (u, i) => fetch(u, i), env.VERIFIER_URL, spec);
      if (status !== 202) console.error(`dispatch: the verifier answered ${status}`);
    } else if (env.VERIFIER_CONTAINER) {
      await env.VERIFIER_CONTAINER.getByName(env.CEREMONY_ID).enqueue(spec);
    }
  } catch (error) {
    console.error("dispatch:", error);
  }
}

/**
 * Starts the verifier container ahead of a turn's first upload (its start, about a minute, then
 * does not count inside that job's deadline). Only the container is warmed; never throws.
 */
export async function warmVerifier(env: Env): Promise<void> {
  if (env.VERIFIER_URL || !env.VERIFIER_CONTAINER) return;
  try {
    await env.VERIFIER_CONTAINER.getByName(env.CEREMONY_ID).warm();
  } catch (error) {
    console.error("warm:", error);
  }
}
