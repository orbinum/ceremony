/** Keccak-256 (EVM) as raw bytes: EIP-712 domain salts and EIP-55 checksums. */
import { keccak_256 } from "@noble/hashes/sha3.js";

export const keccak256 = (data: Uint8Array): Uint8Array => keccak_256(data);
