/**
 * The body of `POST /api/session/attest`: the attestation payload and its signature, under the
 * linked wallet's scheme.
 */
import { asRecord } from "../../../primitives/schema";
import { asWalletSignature } from "../signatures";
import type { AttestationPayload, Scheme } from "../types";
import { validateAttestationPayload } from "./validate-attestation-payload";

export function validateAttestationRequest(
  body: unknown,
  scheme: Scheme,
): { payload: AttestationPayload; signature: string } {
  const o = asRecord(body, "attestation", ["payload", "signature"]);
  return {
    payload: validateAttestationPayload(o.payload, scheme, "attestation.payload"),
    signature: asWalletSignature(o.signature, "attestation.signature", scheme),
  };
}
