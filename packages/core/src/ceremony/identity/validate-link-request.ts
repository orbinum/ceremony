/** The body of `POST /api/link`: the scheme, the signed link payload and its signature, nothing else. */
import { asOneOf, asRecord } from "../../primitives/schema";
import { asWalletSignature } from "./as-wallet-signature";
import { SCHEMES } from "./constants";
import type { LinkPayload, Scheme } from "./types";
import { validateLinkPayload } from "./validate-link-payload";

export function validateLinkRequest(body: unknown): {
  scheme: Scheme;
  payload: LinkPayload;
  signature: string;
} {
  const o = asRecord(body, "link", ["scheme", "payload", "signature"]);
  const scheme = asOneOf(o.scheme, "link.scheme", SCHEMES);
  return {
    scheme,
    payload: validateLinkPayload(o.payload, scheme, "link.payload"),
    signature: asWalletSignature(o.signature, "link.signature", scheme),
  };
}
