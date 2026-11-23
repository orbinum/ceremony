/**
 * Hands a job to the verifier (`POST <VERIFIER_URL>/verify`, HMAC bound to this ceremony, expects
 * 202), with the Access service token of its Tunnel when one is set (KL-45). A redirect is never
 * followed (`manual`; workerd has no `error` mode) and counts as a failure. A failed dispatch is
 * only logged: the verify deadline turns the silence into `infra`. COORDINATOR §5.
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

/** Dispatches `spec`; never throws. */
export async function dispatch(env: Env, spec: JobSpec): Promise<void> {
  if (!env.VERIFIER_URL) return;
  try {
    const url = new URL(VERIFIER_PATHS.verify, env.VERIFIER_URL);
    const body = JSON.stringify(spec);
    const init = signedRequestInit(
      env.VERIFIER_HMAC_KEY,
      env.CEREMONY_ID,
      "POST",
      url,
      body,
      Date.now(),
    );
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), ...accessHeaders(env, url) },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Nothing in the answer is read: release it.
    await response.body?.cancel();
    if (response.status !== 202)
      console.error(`dispatch: the verifier answered ${response.status}`);
  } catch (error) {
    console.error("dispatch:", error);
  }
}
