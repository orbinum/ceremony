/** SHA-256 as lowercase hex, the hash of files in records and APIs. */
import { sha256 } from "@noble/hashes/sha2.js";
import { toHex } from "../encoding";

export const sha256Hex = (data: Uint8Array): string => toHex(sha256(data));
