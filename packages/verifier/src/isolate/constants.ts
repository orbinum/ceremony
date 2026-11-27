/**
 * Bounds of isolated tasks, measured on the rehearsal circuits with the 2^16 ptau (three runs each,
 * Apple M-series): `newZKey` and `verifyFromR1cs` take ≤ 14 s, `verifyFromInit`, `contribute` and
 * `beacon` ≤ 6 s, `exportVerificationKey` ≤ 0.4 s; the largest peak RSS is 895 MB
 * (`verifyFromR1cs` on transfer, Apple M4, with core's wallet libraries loaded; 824 MB for
 * `verifyFromInit`). The bounds leave room for hardware 2–3× slower and for process start-up
 * (~1 s); the resident bound is ~2.3× the largest peak. `heavy` is Groth16 setup and full
 * verification from r1cs, `medium` one contribution, the beacon and verification from the
 * genesis, `light` reading the verification key out of a zkey. A child stopped by its memory
 * watchdog exits with `EXIT_OUT_OF_MEMORY`.
 */
import type { Limits } from "./types";

export const EXIT_OUT_OF_MEMORY = 75;

export const MAX_RSS_BYTES = 2 * 1024 ** 3;

export const LIMITS = {
  heavy: { timeoutMs: 120_000, maxRssBytes: MAX_RSS_BYTES },
  medium: { timeoutMs: 60_000, maxRssBytes: MAX_RSS_BYTES },
  light: { timeoutMs: 30_000, maxRssBytes: MAX_RSS_BYTES },
} as const satisfies Record<string, Limits>;
