/**
 * The turn's timing. Transient failures are retried for a minute after the first one. Heartbeats
 * every 15 s keep the slot well inside its 90 s window, and four transient failures in a row (a
 * minute) lose it. A verdict takes seconds: past `VERDICT_FOR_MS` the coordinator's own deadline
 * has long passed. Rejections and lost uploads per circuit and turn are bounded by `MAX_ATTEMPTS`.
 */
export const RETRY_FOR_MS = 60_000;
export const MAX_BACKOFF_MS = 10_000;

export const POLL_MS = 2_000;
export const VERDICT_FOR_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 4;

export const HEARTBEAT_MS = 15_000;
export const HEARTBEAT_FAILURES = 4;
export const FINISH_FOR_MS = 15 * 60_000;
export const FINISH_POLL_MS = 2_000;
