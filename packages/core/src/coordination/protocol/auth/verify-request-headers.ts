/**
 * Whether the headers authenticate a request with this ceremony, method and path at `now`, before
 * its body is read; `bodyMatches` then binds the bounded body. An unauthenticated request costs one
 * HMAC over a few hundred bytes, whatever body it announces.
 */
import { keyBytes, timingSafeEqual } from "../../../primitives/hashing";
import { authHeadersWellFormed, timestampFresh } from "../headers";
import { HMAC_KEY_LABEL } from "../constants";
import { requestMac, unambiguousRequest } from "./request-mac";
import type { RequestAuthHeaders } from "../types";

export function verifyRequestHeaders(
  key: string,
  ceremonyId: string,
  method: string,
  path: string,
  headers: RequestAuthHeaders,
  now: number,
): boolean {
  const k = keyBytes(key, HMAC_KEY_LABEL);
  if (!authHeadersWellFormed(headers)) return false;
  if (!unambiguousRequest(ceremonyId, method, path)) return false;
  const { timestamp, signature, bodySha256 } = headers as Record<keyof RequestAuthHeaders, string>;
  if (!timestampFresh(timestamp, now)) return false;
  return timingSafeEqual(signature, requestMac(k, ceremonyId, timestamp, method, path, bodySha256));
}
