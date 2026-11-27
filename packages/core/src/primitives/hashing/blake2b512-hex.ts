/** BLAKE2b-512 as lowercase hex. */
import { blake2b } from "@noble/hashes/blake2.js";
import { toHex } from "../encoding";

export const blake2b512Hex = (data: Uint8Array): string => toHex(blake2b(data, { dkLen: 64 }));
