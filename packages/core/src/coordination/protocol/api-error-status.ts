/**
 * The HTTP status of each error code the coordinator answers with; any code not listed is a
 * conflict with the current state (409). `storage` is the bucket failing, not the request, so the
 * caller may retry.
 */
import type { ApiErrorCode } from "./types";

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

export const apiErrorStatus = (code: ApiErrorCode) => STATUS[code] ?? 409;
