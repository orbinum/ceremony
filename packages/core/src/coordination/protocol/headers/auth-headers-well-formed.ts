/**
 * Whether request-auth headers have the shape `signRequest` gives them: a decimal timestamp, a
 * 32-byte lowercase hex MAC and body digest.
 */
import type { RequestAuthHeaders } from "../types";

const HEX32 = /^[0-9a-f]{64}$/;

export const authHeadersWellFormed = (h: RequestAuthHeaders): boolean =>
  typeof h.timestamp === "string" &&
  /^\d{1,16}$/.test(h.timestamp) &&
  typeof h.signature === "string" &&
  HEX32.test(h.signature) &&
  typeof h.bodySha256 === "string" &&
  HEX32.test(h.bodySha256);
