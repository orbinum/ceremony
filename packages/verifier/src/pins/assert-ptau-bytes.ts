/** The ptau pin check on bytes already read: the bytes that will be used. */
import { blake2b512Hex, PTAU } from "@orbinum-ceremony/core";

export function assertPtauBytes(bytes: Uint8Array): void {
  if (bytes.length !== PTAU.sizeBytes || blake2b512Hex(bytes) !== PTAU.blake2b512) {
    throw new Error("ptau does not match the pin");
  }
}
