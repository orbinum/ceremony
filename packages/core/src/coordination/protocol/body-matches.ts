/** Whether a body (its bytes as received) is the one the authenticated headers name. */
import { sha256Hex } from "../../primitives/hashing";
import type { RequestAuthHeaders } from "./types";

export const bodyMatches = (body: Uint8Array, headers: RequestAuthHeaders): boolean =>
  headers.bodySha256 === sha256Hex(body);
