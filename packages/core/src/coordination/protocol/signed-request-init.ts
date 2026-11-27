/** A JSON request authenticated as `signRequest` defines, ready for `fetch`. */
import { signRequest } from "./sign-request";

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
