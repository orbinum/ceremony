/** The three request-auth headers, read through `get` (a lookup by lowercase header name). */
import { BODY_SHA256_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../constants";
import type { RequestAuthHeaders } from "../types";

export const requestAuthOf = (
  get: (name: string) => string | null | undefined,
): RequestAuthHeaders => ({
  timestamp: get(TIMESTAMP_HEADER),
  signature: get(SIGNATURE_HEADER),
  bodySha256: get(BODY_SHA256_HEADER),
});
