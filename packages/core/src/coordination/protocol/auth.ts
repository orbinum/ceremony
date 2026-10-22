/**
 * Coordinator ↔ verifier request authentication, both directions: HMAC-SHA-256 with the shared
 * key over `ceremony_id \n timestamp \n method \n path \n body`, the timestamp in epoch ms within
 * the skew. The ceremony id keeps a request for one ceremony from verifying for another under a
 * reused key. Every request it guards is idempotent, so a replay inside the window is harmless.
 * COORDINATOR §5.
 */
import { REQUEST_AUTH } from "../../config";
import { hmacSha256Hex, keyBytes, timingSafeEqual } from "../../primitives/hashing";
import { CEREMONY_ID } from "../../primitives/schema";

/** Header carrying the timestamp (epoch ms). */
export const TIMESTAMP_HEADER = "x-ceremony-timestamp";
/** Header carrying the MAC (lowercase hex). */
export const SIGNATURE_HEADER = "x-ceremony-signature";

const HMAC_KEY = "HMAC key";

/** Throws unless `key` is a usable shared key (at least `MIN_KEY_BYTES` bytes). */
export const checkHmacKey = (key: string): void => void keyBytes(key, HMAC_KEY);

/**
 * Whether the two headers have the shape `signRequest` gives them (decimal timestamp, 32-byte hex
 * MAC): checked before a receiver reads the body.
 */
export const authHeadersWellFormed = (
  timestamp: string | null | undefined,
  signature: string | null | undefined,
): boolean =>
  typeof timestamp === "string" &&
  /^\d{1,16}$/.test(timestamp) &&
  typeof signature === "string" &&
  /^[0-9a-f]{64}$/.test(signature);

/**
 * Each field but the body ends at a newline in the MAC input, so none may contain one; the
 * ceremony id is a ceremony id.
 */
const unambiguous = (ceremonyId: string, method: string, path: string) =>
  CEREMONY_ID.test(ceremonyId) && !/\n/.test(method) && !/\n/.test(path);

const mac = (
  key: Uint8Array,
  ceremonyId: string,
  ts: string,
  method: string,
  path: string,
  body: string,
) => hmacSha256Hex(key, `${ceremonyId}\n${ts}\n${method}\n${path}\n${body}`);

/** The two headers that authenticate a request of ceremony `ceremonyId` made at `now`. */
export function signRequest(
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  body: string,
  now: number,
): Record<string, string> {
  const k = keyBytes(key, HMAC_KEY);
  if (!unambiguous(ceremonyId, method, path)) {
    throw new Error("a ceremony id, and a method and path without a newline, are required");
  }
  const ts = String(now);
  return {
    [TIMESTAMP_HEADER]: ts,
    [SIGNATURE_HEADER]: mac(k, ceremonyId, ts, method, path, body),
  };
}

/** Whether the headers authenticate this exact request of ceremony `ceremonyId` at `now`. */
export function verifyRequest(
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  body: string,
  headers: { timestamp: string | null | undefined; signature: string | null | undefined },
  now: number,
): boolean {
  const k = keyBytes(key, HMAC_KEY);
  const { timestamp, signature } = headers;
  if (!authHeadersWellFormed(timestamp, signature)) return false;
  if (!unambiguous(ceremonyId, method, path)) return false;
  if (Math.abs(now - Number(timestamp)) > REQUEST_AUTH.skewMs) return false;
  return timingSafeEqual(
    signature as string,
    mac(k, ceremonyId, timestamp as string, method, path, body),
  );
}

/** A JSON request authenticated as `signRequest` defines, ready for `fetch`. */
export function signedRequestInit(
  key: string,
  ceremonyId: string,
  method: string,
  url: URL,
  body: string,
  now: number,
): RequestInit {
  return {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...signRequest(key, ceremonyId, method, url.pathname, body, now),
    },
    ...(body ? { body } : {}),
  };
}
