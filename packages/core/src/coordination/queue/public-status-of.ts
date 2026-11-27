/**
 * `GET /api/status`: the live phase and counts, without identities or chain values. `sessions`
 * counts turns given, including ones that ended with nothing accepted (a no-show, a rejection);
 * `contributors`, the accounts with at least one accepted contribution.
 */
import type { QueueState } from "./types";

export const publicStatusOf = (state: QueueState) => ({
  phase: state.phase,
  queued: state.queue.length,
  active: state.slot !== null,
  sessions: state.nextSeq - 1,
  contributors: Object.values(state.identities).filter((i) => i.accepted.length > 0).length,
});
