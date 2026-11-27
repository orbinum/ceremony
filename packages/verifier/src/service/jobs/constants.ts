/**
 * Bounds of the job queue. A job's whole run, report included, fits the coordinator's verify
 * deadline: it stops waiting after that. Recent job keys are kept for dedupe, since a repeated
 * dispatch is a retry of a recent one. At most `MAX_PENDING` jobs are queued or running: the
 * coordinator verifies one upload at a time, so a longer line is a stale backlog, and refusing it
 * keeps fresh work from waiting behind expired work.
 */
import { VERIFY_DEADLINE_MS } from "@orbinum-ceremony/core";

export const JOB_DEADLINE_MS = VERIFY_DEADLINE_MS;

export const SEEN_KEYS = 1024;

export const MAX_PENDING = 32;
