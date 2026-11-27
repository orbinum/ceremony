/** SHA-256 as raw bytes: chain links hash digests, not their hex. */
import { sha256 } from "@noble/hashes/sha2.js";

export const sha256Bytes = (data: Uint8Array): Uint8Array => sha256(data);
