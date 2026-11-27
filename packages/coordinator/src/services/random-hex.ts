/** Random bytes as lowercase hex (Web Crypto), for nonces, OAuth states and object keys. */
import { toHex } from "@orbinum-ceremony/core";

export const randomHex = (bytes: number): string =>
  toHex(crypto.getRandomValues(new Uint8Array(bytes)));
