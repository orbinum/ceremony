/**
 * Hands a job to the verifier, expecting 202, by `VERIFIER_URL` (`POST <url>/verify`) or else the
 * `VERIFIER_CONTAINER` Durable Object, which starts the container and posts it there; with neither,
 * nothing is dispatched. Never throws: a failed dispatch is only logged, and the verify deadline
 * turns the silence into `infra`.
 */
import type { JobSpec } from "@orbinum-ceremony/core";
import { postJob } from "./post-job";

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
