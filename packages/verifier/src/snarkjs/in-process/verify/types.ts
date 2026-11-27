/**
 * A `zkey verify` result: `ok` only if snarkjs returned true and logged "ZKey Ok!" (core's rule).
 */
export interface VerifyOutcome {
  ok: boolean;
  log: string;
}
