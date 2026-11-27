/**
 * The MAC of a coordinator ↔ verifier request: HMAC-SHA-256 with the shared key over
 * `direction \n ceremony_id \n timestamp \n method \n path \n sha256(body)`. The direction
 * (`dispatch` to the verifier, `callback` to the coordinator's `/internal`) follows from the path
 * and no other path can be signed, so a request made for one side never verifies on the other even
 * if a route is added or renamed. The ceremony id keeps a request for one ceremony from verifying
 * for another under a reused key. Each field but the body ends at a newline, so none may hold one.
 */
import { hmacSha256Hex } from "../../primitives/hashing";
import { CEREMONY_ID } from "../../primitives/schema";
import { VERIFIER_PATHS } from "./constants";

function directionOf(path: string): "dispatch" | "callback" | null {
  if (path === VERIFIER_PATHS.verify) return "dispatch";
  return path.startsWith("/internal/") ? "callback" : null;
}

export const unambiguousRequest = (ceremonyId: string, method: string, path: string) =>
  CEREMONY_ID.test(ceremonyId) &&
  !/\n/.test(method) &&
  !/\n/.test(path) &&
  directionOf(path) !== null;

export const requestMac = (
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
