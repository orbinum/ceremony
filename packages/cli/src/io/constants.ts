/**
 * Time bounds and retries of the coordinator calls that several io modules share. `ADMIN_RETRY`:
 * attempts of one admin call, and the wait before the second (doubled before each next one).
 */

export const ADMIN_TIMEOUT_MS = 10 * 60_000;

export const ADMIN_RETRY = { attempts: 3, backoffMs: 2_000 };

export const PUBLIC_DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
