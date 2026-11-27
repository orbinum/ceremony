/** HMAC-SHA-256 of `message` under `key`, lowercase hex (`keyBytes` enforces the key length). */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { toHex, utf8 } from "../../encoding";

export const hmacSha256Hex = (key: Uint8Array, message: string): string =>
  toHex(hmac(sha256, key, utf8(message)));
