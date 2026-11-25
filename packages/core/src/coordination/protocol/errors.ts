/**
 * The coordinator's error contract: every refusal code clients may read, and its HTTP status.
 * COORDINATOR §3.
 */
import type { QueueRefusal } from "../queue";

/** Refusals of the ceremony's object itself, besides the queue's own. */
export type CeremonyRefusal =
  | QueueRefusal
  | "not-configured"
  | "already-configured"
  | "malformed-setup"
  | "not-linked"
  /** A closed ceremony does not invite the account. */
  | "not-invited"
  | "nonce-invalid"
  | "already-linked"
  | "wallet-taken"
  | "stale-head"
  | "too-large"
  | "unknown-job"
  | "attestation-mismatch"
  | "already-attested"
  /** A finalization that does not seal this transcript (`checkFinalize`). */
  | "not-finalizable"
  /** The bucket failed (not the request): the caller may retry. */
  | "storage";

/** Every code an `{ error: { code } }` answer may carry. */
export type ApiErrorCode =
  | CeremonyRefusal
  | "malformed"
  | "wrong-identity"
  | "stale-signature"
  | "invalid-signature"
  | "immutable"
  | "unauthenticated"
  | "forbidden"
  | "turnstile"
  | "rate-limited"
  | "not-found"
  | "internal";

/** HTTP status per code; anything not listed is a conflict with the current state (409). */
const STATUS: Partial<Record<ApiErrorCode, 400 | 401 | 403 | 404 | 413 | 429 | 500 | 503>> = {
  malformed: 400,
  "malformed-setup": 400,
  "stale-signature": 400,
  unauthenticated: 401,
  "invalid-signature": 401,
  banned: 403,
  held: 403,
  "not-linked": 403,
  "not-invited": 403,
  "wrong-identity": 403,
  forbidden: 403,
  turnstile: 403,
  "unknown-job": 404,
  "not-found": 404,
  "too-large": 413,
  cooldown: 429,
  "rate-limited": 429,
  internal: 500,
  "not-configured": 503,
  storage: 503,
};

/** The HTTP status of an error code. */
export const apiErrorStatus = (code: ApiErrorCode) => STATUS[code] ?? 409;
