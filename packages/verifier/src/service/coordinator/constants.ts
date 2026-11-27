/**
 * Bounds on calls to the coordinator: one request, response headers and body included, and the
 * tries per call without a deadline. With one (every job's call), network errors, 5xx and 429 are
 * retried until it passes: a coordinator answering 503 for a while must not lose the result.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

export const MAX_ATTEMPTS = 5;
