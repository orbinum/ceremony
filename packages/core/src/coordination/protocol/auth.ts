/**
 * Coordinator ↔ verifier request authentication, both directions: HMAC-SHA-256 with the shared
 * key over `direction \n ceremony_id \n timestamp \n method \n path \n body`, the timestamp in
 * epoch ms within the skew. The direction (`dispatch` to the verifier, `callback` to the
 * coordinator) follows from the path, and no other path can be signed, so a request made for one
 * side never verifies on the other even if a route is added or renamed. The ceremony id keeps a
 * request for one ceremony from verifying for another under a reused key. Every request it guards
 * is idempotent, so a replay inside the window is harmless. COORDINATOR §5.
 */
import { REQUEST_AUTH } from "../../config";
import { hmacSha256Hex, keyBytes, timingSafeEqual } from "../../primitives/hashing";
import { CEREMONY_ID } from "../../primitives/schema";
import { VERIFIER_PATHS } from "./paths";

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
  body: string,
) => hmacSha256Hex(key, `${directionOf(path)}\n${ceremonyId}\n${ts}\n${method}\n${path}\n${body}`);

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
    throw new Error(
      "a ceremony id, and a method and a verifier or /internal path without a newline, are required",
    );
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
  if (!timestampFresh(timestamp as string, now)) return false;
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
