/** Whether a link payload is signed by its own account under a scheme. */
import type { LinkPayload, Scheme } from "./types";
import { verifySigned } from "./verify-signed";

export const verifyLink = (scheme: Scheme, payload: LinkPayload, signature: string): boolean =>
  verifySigned(scheme, { kind: "link", payload }, signature);
