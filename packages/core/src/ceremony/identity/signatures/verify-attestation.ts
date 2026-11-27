/** Whether an attestation payload is signed by its own account under a scheme. */
import type { AttestationPayload, Scheme } from "../types";
import { verifySigned } from "./verify-signed";

export const verifyAttestation = (
  scheme: Scheme,
  payload: AttestationPayload,
  signature: string,
): boolean => verifySigned(scheme, { kind: "attestation", payload }, signature);
