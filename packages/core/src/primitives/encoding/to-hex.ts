/**
 * Bytes to lowercase hex, the encoding of every hash in records and APIs. Imports nothing but
 * @noble/hashes, so the light snarkjs-child entry can load it directly.
 */
import { bytesToHex } from "@noble/hashes/utils.js";

export const toHex = (bytes: Uint8Array | ArrayBuffer): string =>
  bytesToHex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
