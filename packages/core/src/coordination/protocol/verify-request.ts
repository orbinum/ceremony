/** Whether the headers authenticate this exact request (its body as text) at `now`. */
import { sha256Utf8 } from "../../primitives/hashing";
import type { RequestAuthHeaders } from "./types";
import { verifyRequestHeaders } from "./verify-request-headers";

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
