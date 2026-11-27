/** The session queue's timers and limits, in milliseconds. */
import { VERIFY_DEADLINE_MS } from "./verifier";

export const QUEUE_RULES = {
  claimWindowMs: 30_000,
  heartbeatMs: 30_000,
  missedHeartbeats: 3,
  activeCapMs: 20 * 60_000,
  noShowsForCooldown: 2,
  cooldownMs: 15 * 60_000,
  verifyDeadlineMs: VERIFY_DEADLINE_MS,
  maxRejected: 3,
  attemptsPerCircuit: 2,
  infraPerSession: 2,
  maxInfraResults: 6,
} as const;
