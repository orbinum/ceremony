/** Randomness for nonces, OAuth states and object keys (Web Crypto). */
import { toHex } from "@orbinum-ceremony/core";

/** `bytes` random bytes, lowercase hex. */
export const randomHex = (bytes: number): string =>
  toHex(crypto.getRandomValues(new Uint8Array(bytes)));
