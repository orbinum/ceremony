/**
 * Posts a job spec to `<base>/verify` through `send`, signed for this ceremony (HMAC), and returns
 * the verifier's status; throws on I/O. The Access service token of the verifier's Tunnel is added
 * when one is set, over https only (never to a local plain-http verifier). A redirect is never
 * followed (`manual`; workerd has no `error` mode), so it reads as a failed status. Nothing in the
 * answer is read, so its body is released.
 */
import { type JobSpec, signedRequestInit, VERIFIER_PATHS } from "@orbinum-ceremony/core";

const TIMEOUT_MS = 30_000;

function accessHeaders(env: Env, url: URL): Record<string, string> {
  const id = env.VERIFIER_ACCESS_CLIENT_ID;
  const secret = env.VERIFIER_ACCESS_CLIENT_SECRET;
  if (url.protocol !== "https:" || !id || !secret) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}

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
  await response.body?.cancel();
  return response.status;
}
