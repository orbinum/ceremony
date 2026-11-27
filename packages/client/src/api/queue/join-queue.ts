/** Joins the line. The coordinator checks the Turnstile token everywhere but a local run. */
import { call } from "../http";

export const joinQueue = (turnstileToken?: string) =>
  call<{ ok: true }>(
    "POST",
    "/api/queue/join",
    undefined,
    turnstileToken ? { "x-turnstile-token": turnstileToken } : {},
  );
