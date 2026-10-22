/**
 * Paths and headers both sides of each wire agree on: coordinator ↔ verifier (HMAC), the
 * contributor's routes and upload claim, the operator's marker and the local development identity.
 * COORDINATOR §3, §5.
 */
import type { CircuitName } from "../../config";
import { jobKey } from "./jobs";
import type { JobId } from "./types";

/** Served by the verifier. */
export const VERIFIER_PATHS = { verify: "/verify" } as const;

/** Served by the coordinator to the verifier only. */
export const INTERNAL_PATHS = {
  /** `GET`: the private object of a pending job. */
  object: (job: JobId) => `/internal/objects/${jobKey(job)}`,
  /** `POST`: a verification result. */
  verifications: "/internal/verifications",
} as const;

/**
 * Served by the coordinator to a contributor. `cliToken` is minted in the browser (session
 * cookie); every other path also takes that token as `Authorization: Bearer` (SPEC §4.4).
 */
export const CONTRIBUTOR_PATHS = {
  /** `POST`: a short-lived CLI token for the signed-in, linked identity. */
  cliToken: "/api/cli-token",
  /** `GET`: one's place in line or one's session. */
  me: "/api/queue/me",
  /** `POST`: leaves the line, or ends one's own session. */
  leave: "/api/queue/leave",
  /** `POST`: the slot events. */
  claim: "/api/session/claim",
  heartbeat: "/api/session/heartbeat",
  finish: "/api/session/finish",
  /** `GET`: what the next contribution to `circuit` must extend. */
  head: (circuit: CircuitName) => `/api/session/head/${circuit}`,
  /** `PUT`: one contribution, with its claim in `CLAIM_HEADER`. */
  upload: (circuit: CircuitName) => `/api/session/upload/${circuit}`,
  /** `GET`: the verdict of the latest upload for `circuit`. */
  result: (circuit: CircuitName) => `/api/session/result/${circuit}`,
} as const;

/** The upload's claim, as JSON, next to its streamed body. */
export const CLAIM_HEADER = "x-ceremony-claim";

/**
 * Sent by the operator's tools on every `/admin` call: a custom header forces a CORS preflight,
 * so no page can make an operator's browser send an admin request.
 */
export const OPERATOR_HEADER = "x-ceremony-operator";

/** A local coordinator's development identity (no OAuth); refused anywhere else. */
export const DEV_IDENTITY_HEADERS = { id: "x-dev-github-id", login: "x-dev-github-login" } as const;
