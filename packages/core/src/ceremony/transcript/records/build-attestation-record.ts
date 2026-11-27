/** Builds a validated attestation record for a payload the wallet of a scheme signed. */
import type { AttestationPayload, Scheme } from "../../identity";
import { normalizeSignature } from "../../../primitives/encoding";
import type { AttestationRecord } from "../types";
import { validateRecord } from "../validate";

export const buildAttestationRecord = (
  payload: AttestationPayload,
  scheme: Scheme,
  signature: string,
): AttestationRecord =>
  validateRecord({
    type: "attestation",
    ceremony_id: payload.ceremony_id,
    seq: payload.seq,
    payload,
    scheme,
    signature: normalizeSignature(signature),
  } satisfies AttestationRecord) as AttestationRecord;
