/**
 * Hash functions of the ceremony: SHA-256 for files, BLAKE2b for snarkjs and Substrate. SPEC §3.3.
 */
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { toHex, utf8 } from "../encoding";

/** Incremental hasher, so callers can stream large files (ptau, zkeys) without buffering them. */
export interface StreamingHasher {
  update(chunk: Uint8Array): StreamingHasher;
  digestHex(): string;
}

function streaming(create: () => { update(b: Uint8Array): unknown; digest(): Uint8Array }) {
  return (): StreamingHasher => {
    const inner = create();
    const hasher: StreamingHasher = {
      update(chunk) {
        inner.update(chunk);
        return hasher;
      },
      digestHex: () => toHex(inner.digest()),
    };
    return hasher;
  };
}

/** Streaming SHA-256: file integrity. */
export const createSha256 = streaming(() => sha256.create());

/** Streaming snarkjs-compatible BLAKE2b-512: the ptau pin, csHash and h_k. */
export const createBlake2b512 = streaming(() => blake2b.create({ dkLen: 64 }));

/** SHA-256 as raw bytes (chain links hash digests, not their hex). */
export const sha256Bytes = (data: Uint8Array): Uint8Array => sha256(data);

/** SHA-256, lowercase hex. */
export const sha256Hex = (data: Uint8Array): string => toHex(sha256(data));

/** SHA-256 of a string's UTF-8 bytes, lowercase hex (published text files, logs). */
export const sha256Utf8 = (text: string): string => sha256Hex(utf8(text));

/** BLAKE2b-512, lowercase hex. */
export const blake2b512Hex = (data: Uint8Array): string => toHex(blake2b(data, { dkLen: 64 }));

/** Substrate `blake2_256`: the on-chain VK hash convention. SPEC §2.6. */
export const blake2b256Hex = (data: Uint8Array): string => toHex(blake2b(data, { dkLen: 32 }));

/** Keccak-256 (EVM), raw bytes: EIP-712 domain salts and EIP-55 checksums. */
export const keccak256 = (data: Uint8Array): Uint8Array => keccak_256(data);
