/** In-process zkey verifications, passing only on true from snarkjs and "ZKey Ok!" logged. */
export type { VerifyOutcome } from "./types";
export { verifyFromInit } from "./verify-from-init";
export { verifyFromR1cs } from "./verify-from-r1cs";
