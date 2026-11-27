/** Hex (either case, no prefix) to bytes; throws on odd length or non-hex characters. */
import { hexToBytes } from "@noble/hashes/utils.js";

export const fromHex = (hex: string): Uint8Array => hexToBytes(hex);
