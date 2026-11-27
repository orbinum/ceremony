/**
 * Whether snarkjs' `zkey verify` passed: it counts only if it returned true and also logged its
 * success marker. Imports nothing: the snarkjs child loads it without the barrel's wallet
 * libraries.
 */
const ZKEY_OK_MARKER = "ZKey Ok!";

export const zkeyVerifyPassed = (returned: boolean, log: string): boolean =>
  returned && log.includes(ZKEY_OK_MARKER);
