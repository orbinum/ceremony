/**
 * Paths and headers both sides of each wire agree on: the verifier's route, the coordinator's
 * internal, contributor and operator routes, the request-auth headers, the upload claim and the
 * local development identity. The operator header is custom so that it forces a CORS preflight:
 * no page can make an operator's browser send an admin request. `cliToken` is minted in the
 * browser (session cookie); every other contributor path also takes that token as a bearer. An
 * admin artifact (a setup file before configuring, a final file before finalizing) is immutable
 * once published, its bytes checked against `CONTENT_SHA256_HEADER`.
 */
import type { CircuitName } from "../../config";
import { jobKey } from "./job-key";
import type { JobId } from "./types";

export const TIMESTAMP_HEADER = "x-ceremony-timestamp";
export const SIGNATURE_HEADER = "x-ceremony-signature";
export const BODY_SHA256_HEADER = "x-ceremony-body-sha256";
export const HMAC_KEY_LABEL = "HMAC key";

export const CONTENT_SHA256_HEADER = "x-content-sha256";
export const CLAIM_HEADER = "x-ceremony-claim";
export const OPERATOR_HEADER = "x-ceremony-operator";
export const DEV_IDENTITY_HEADERS = { id: "x-dev-github-id", login: "x-dev-github-login" } as const;

export const VERIFIER_PATHS = { verify: "/verify" } as const;

export const INTERNAL_PATHS = {
  object: (job: JobId) => `/internal/objects/${jobKey(job)}`,
  verifications: "/internal/verifications",
} as const;

export const CONTRIBUTOR_PATHS = {
  cliToken: "/api/cli-token",
  me: "/api/queue/me",
  leave: "/api/queue/leave",
  claim: "/api/session/claim",
  heartbeat: "/api/session/heartbeat",
  finish: "/api/session/finish",
  head: (circuit: CircuitName) => `/api/session/head/${circuit}`,
  upload: (circuit: CircuitName) => `/api/session/upload/${circuit}`,
  result: (circuit: CircuitName) => `/api/session/result/${circuit}`,
} as const;

export const ADMIN_PATHS = {
  artifact: (key: string) => `/admin/artifacts/${key}`,
  configure: "/admin/configure",
  state: "/admin/state",
  unhold: "/admin/unhold",
  finalize: "/admin/finalize",
} as const;
