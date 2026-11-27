/**
 * `GET /api/config`: what the page needs from the deployment serving it. A `null` network is a
 * misconfigured coordinator; a `null` Turnstile key means no check (a local run) or, when unset
 * elsewhere, that joining is refused.
 */
import { call } from "./http";
import type { Config } from "./types";

export const getConfig = () => call<Config>("GET", "/api/config");
