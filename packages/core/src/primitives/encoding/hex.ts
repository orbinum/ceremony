/** Hex codec: lowercase hex is the encoding of every hash in records and APIs. SPEC §3.3. */
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/** Bytes → lowercase hex. */
export const toHex = (bytes: Uint8Array | ArrayBuffer): string =>
  bytesToHex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

/** Hex (either case, no prefix) → bytes; throws on odd length or non-hex characters. */
export const fromHex = (hex: string): Uint8Array => hexToBytes(hex);

/** `0x`-prefixed hex, as EVM APIs expect it. */
export const hex0x = (hex: string): string => `0x${hex}`;

/** Canonical form of a wallet signature: lowercase, without `0x`. */
export const normalizeSignature = (signature: string): string =>
  signature.replace(/^0x/i, "").toLowerCase();
