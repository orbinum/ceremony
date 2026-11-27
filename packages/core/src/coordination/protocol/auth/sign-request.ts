/**
 * The three headers that authenticate a coordinator ↔ verifier request made at `now` (epoch ms).
 * The body's digest travels in its own header, so a receiver checks the MAC before reading a
 * single body byte. Every request it guards is idempotent, so a replay inside the skew is harmless.
 */
import { keyBytes, sha256Utf8 } from "../../../primitives/hashing";
import {
  BODY_SHA256_HEADER,
  HMAC_KEY_LABEL,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../constants";
import { requestMac, unambiguousRequest } from "./request-mac";

export function signRequest(
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  body: string,
  now: number,
): Record<string, string> {
  const k = keyBytes(key, HMAC_KEY_LABEL);
  if (!unambiguousRequest(ceremonyId, method, path)) {
    throw new Error(
      "a ceremony id, and a method and a verifier or /internal path without a newline, are required",
    );
  }
  const ts = String(now);
  const digest = sha256Utf8(body);
  return {
    [TIMESTAMP_HEADER]: ts,
    [BODY_SHA256_HEADER]: digest,
    [SIGNATURE_HEADER]: requestMac(k, ceremonyId, ts, method, path, digest),
  };
}
