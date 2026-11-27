/**
 * The key HMAC-SHA-256 actually uses: a key longer than the 64-byte block is hashed first, and
 * the key is zero-padded to the block, so trailing zero bytes do not count. Two keys with the same
 * form are the same key.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { toHex, utf8 } from "../encoding";

export function hmacKeyForm(key: string): string {
  let bytes = utf8(key);
  if (bytes.length > 64) bytes = sha256(bytes);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return toHex(bytes.subarray(0, end));
}
