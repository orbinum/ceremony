/** The line (SPEC §4.1 steps 3–4): the public status, one's place, joining and leaving. */
import { CONTRIBUTOR_PATHS, type publicStatusOf, type slotView } from "@orbinum-ceremony/core";
import { call } from "./http";

/** `GET /api/status`: phase and counts, nothing about who is in line. */
export type Status = ReturnType<typeof publicStatusOf>;

/** `GET /api/queue/me`: one's place in line, or one's session. */
export type Slot = ReturnType<typeof slotView>;

export const getStatus = () => call<Status>("GET", "/api/status");

export const getSlot = () => call<Slot>("GET", CONTRIBUTOR_PATHS.me);

/** Joins the line. The coordinator checks the Turnstile token everywhere but a local run. */
export const joinQueue = (turnstileToken?: string) =>
  call<{ ok: true }>(
    "POST",
    "/api/queue/join",
    undefined,
    turnstileToken ? { "x-turnstile-token": turnstileToken } : {},
  );

/** Leaves the line, or gives back a turn not yet started. */
export const leaveQueue = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.leave);
