/**
 * A local run (tests, `wrangler dev`): `ENVIRONMENT` is `local` and the request reached this
 * machine by a loopback name. Only then are the development identity, `/admin` without Access and
 * joining without Turnstile allowed; a deployment can never be both.
 */
import { LOOPBACK_HOSTS } from "@orbinum-ceremony/core";

export const isLocal = (env: Env, url: string): boolean =>
  env.ENVIRONMENT === "local" && LOOPBACK_HOSTS.includes(new URL(url).hostname);
