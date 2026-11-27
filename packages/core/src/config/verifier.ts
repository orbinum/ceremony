/**
 * The verifier's timing and size bounds.
 * - `VERIFY_DEADLINE_MS`: how long the verifier has for one upload. An upload made before the close
 *   may be accepted up to this long after it, so the contribution window ends at close + this.
 * - `VERIFIER_TIMEOUT_MS`: the verifier service's bound on one upload, below the coordinator's
 *   deadline so a slow check ends as `infra` there first, and not so low that an honest upload
 *   cannot finish. `REPORT_RESERVE_MS` is kept back from it so the report still lands in time.
 * - `BYTES_PER_CONTRIBUTION`: each contribution grows a zkey by 394 B plus its name (≤ 255 B), so
 *   an upload of contribution k is at most size(genesis) + this × k.
 */
export const VERIFY_DEADLINE_MS = 5 * 60_000;

export const VERIFIER_TIMEOUT_MS = { min: 10_000, max: VERIFY_DEADLINE_MS - 30_000 } as const;

export const REPORT_RESERVE_MS = 15_000;

export const BYTES_PER_CONTRIBUTION = 1024;
