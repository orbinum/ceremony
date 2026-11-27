/** Substrate `blake2_256` as lowercase hex: the on-chain VK hash convention. */
import { blake2b } from "@noble/hashes/blake2.js";
import { toHex } from "../encoding";

export const blake2b256Hex = (data: Uint8Array): string => toHex(blake2b(data, { dkLen: 32 }));
