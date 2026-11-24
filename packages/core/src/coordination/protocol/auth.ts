/**
 * Coordinator ↔ verifier request authentication, both directions: HMAC-SHA-256 with the shared
 * key over `direction \n ceremony_id \n timestamp \n method \n path \n sha256(body)`, the
 * timestamp in epoch ms within the skew. The body's digest travels in its own header, so a
 * receiver checks the MAC before reading a single body byte (`verifyRequestHeaders`), then the
 * bounded body against the digest (`bodyMatches`): an unauthenticated request costs one HMAC over
 * a few hundred bytes, whatever body it announces. The direction (`dispatch` to the verifier, `callback` to the
 * coordinator) follows from the path, and no other path can be signed, so a request made for one
 * side never verifies on the other even if a route is added or renamed. The ceremony id keeps a
 * request for one ceremony from verifying for another under a reused key. Every request it guards
 * is idempotent, so a replay inside the window is harmless. COORDINATOR §5.
 */
import { REQUEST_AUTH } from "../../config";
import {
  hmacSha256Hex,
  keyBytes,
  sha256Hex,
  sha256Utf8,
  timingSafeEqual,
} from "../../primitives/hashing";
import { CEREMONY_ID } from "../../primitives/schema";
import { VERIFIER_PATHS } from "./paths";

/** Header carrying the timestamp (epoch ms). */
export const TIMESTAMP_HEADER = "x-ceremony-timestamp";
/** Header carrying the MAC (lowercase hex). */
export const SIGNATURE_HEADER = "x-ceremony-signature";
/** Header carrying the SHA-256 of the body's bytes (lowercase hex; the empty body's for none). */
export const BODY_SHA256_HEADER = "x-ceremony-body-sha256";

/** The three headers as a receiver reads them. */
export interface RequestAuthHeaders {
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  bodySha256: string | null | undefined;
}

const HEX32 = /^[0-9a-f]{64}$/;

/** The three headers, read through `get` (a lookup by lowercase header name). */
export const requestAuthOf = (
  get: (name: string) => string | null | undefined,
): RequestAuthHeaders => ({
  timestamp: get(TIMESTAMP_HEADER),
  signature: get(SIGNATURE_HEADER),
  bodySha256: get(BODY_SHA256_HEADER),
});

const HMAC_KEY = "HMAC key";

/** Throws unless `key` is a usable shared key (at least `MIN_KEY_BYTES` bytes). */
export const checkHmacKey = (key: string): void => void keyBytes(key, HMAC_KEY);

/**
 * Whether the headers have the shape `signRequest` gives them (decimal timestamp, 32-byte hex MAC
 * and body digest).
 */
export const authHeadersWellFormed = (h: RequestAuthHeaders): boolean =>
  typeof h.timestamp === "string" &&
  /^\d{1,16}$/.test(h.timestamp) &&
  typeof h.signature === "string" &&
  HEX32.test(h.signature) &&
  typeof h.bodySha256 === "string" &&
  HEX32.test(h.bodySha256);

/** Whether `timestamp` (epoch ms, as the header carries it) is within the skew of `now`. */
export const timestampFresh = (timestamp: string, now: number): boolean =>
  Math.abs(now - Number(timestamp)) <= REQUEST_AUTH.skewMs;

/** Who a request to `path` goes to: the verifier's one route, or the coordinator's `/internal`. */
function directionOf(path: string): "dispatch" | "callback" | null {
  if (path === VERIFIER_PATHS.verify) return "dispatch";
  return path.startsWith("/internal/") ? "callback" : null;
}

/**
 * Each field but the body ends at a newline in the MAC input, so none may contain one; the
 * ceremony id is a ceremony id; the path is one of the two sides'.
 */
const unambiguous = (ceremonyId: string, method: string, path: string) =>
  CEREMONY_ID.test(ceremonyId) &&
  !/\n/.test(method) &&
  !/\n/.test(path) &&
  directionOf(path) !== null;

const mac = (
  key: Uint8Array,
  ceremonyId: string,
  ts: string,
  method: string,
  path: string,
  bodySha256: string,
) =>
  hmacSha256Hex(
    key,
    `${directionOf(path)}\n${ceremonyId}\n${ts}\n${method}\n${path}\n${bodySha256}`,
  );

/** The three headers that authenticate a request of ceremony `ceremonyId` made at `now`. */
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
    throw new Error(
      "a ceremony id, and a method and a verifier or /internal path without a newline, are required",
    );
  }
  const ts = String(now);
  const digest = sha256Utf8(body);
  return {
    [TIMESTAMP_HEADER]: ts,
    [BODY_SHA256_HEADER]: digest,
    [SIGNATURE_HEADER]: mac(k, ceremonyId, ts, method, path, digest),
  };
}

/**
 * Whether the headers authenticate a request of ceremony `ceremonyId` with this method and path
 * at `now`, before its body is read; `bodyMatches` then binds the body.
 */
export function verifyRequestHeaders(
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  headers: RequestAuthHeaders,
  now: number,
): boolean {
  const k = keyBytes(key, HMAC_KEY);
  if (!authHeadersWellFormed(headers)) return false;
  if (!unambiguous(ceremonyId, method, path)) return false;
  const { timestamp, signature, bodySha256 } = headers as Record<keyof RequestAuthHeaders, string>;
  if (!timestampFresh(timestamp, now)) return false;
  return timingSafeEqual(signature, mac(k, ceremonyId, timestamp, method, path, bodySha256));
}

/** Whether `body` (its bytes as received) is the one the authenticated headers name. */
export const bodyMatches = (body: Uint8Array, headers: RequestAuthHeaders): boolean =>
  headers.bodySha256 === sha256Hex(body);

/** Whether the headers authenticate this exact request (`body` as text) at `now`. */
export const verifyRequest = (
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  body: string,
  headers: RequestAuthHeaders,
  now: number,
): boolean =>
  verifyRequestHeaders(key, ceremonyId, method, path, headers, now) &&
  headers.bodySha256 === sha256Utf8(body);

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
