/** Message authentication: HMAC-SHA-256, its keys and a constant-time comparison. */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { MIN_KEY_BYTES } from "../../config";
import { toHex, utf8 } from "../encoding";

/** A shared secret as MAC key bytes; one shorter than `MIN_KEY_BYTES` is a configuration error. */
export function keyBytes(key: string, what: string): Uint8Array {
  const bytes = typeof key === "string" ? utf8(key) : new Uint8Array();
  if (bytes.length < MIN_KEY_BYTES)
    throw new Error(`${what} must be at least ${MIN_KEY_BYTES} bytes`);
  return bytes;
}

/** HMAC-SHA-256 of `message` under `key`, lowercase hex (`keyBytes` enforces the key length). */
export const hmacSha256Hex = (key: Uint8Array, message: string): string =>
  toHex(hmac(sha256, key, utf8(message)));

/** Constant-time equality of two strings of one alphabet (MACs, tokens): no early exit. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
