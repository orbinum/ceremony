/**
 * Strict schema of an attestation record: its payload is the one the wallet signed, validated for
 * the record's scheme, bounded in size, and signed for the same ceremony and session.
 */
import { MAX_PAYLOAD_BYTES } from "../../../config";
import { utf8 } from "../../../primitives/encoding";
import { FormatError } from "../../../primitives/errors";
import { canonicalJson } from "../../../primitives/hashing";
import { asCeremonyId, asOneOf, asRecord, asU32 } from "../../../primitives/schema";
import { asStoredSignature, SCHEMES, validateAttestationPayload } from "../../identity";
import type { AttestationRecord } from "../types";

export function validateAttestationRecord(v: unknown, p: string): AttestationRecord {
  const o = asRecord(v, p, ["type", "ceremony_id", "seq", "payload", "scheme", "signature"]);
  const scheme = asOneOf(o.scheme, `${p}.scheme`, SCHEMES);
  const ceremonyId = asCeremonyId(o.ceremony_id, `${p}.ceremony_id`);
  const seq = asU32(o.seq, `${p}.seq`);
  const payload = validateAttestationPayload(o.payload, scheme, `${p}.payload`);
  if (utf8(canonicalJson(payload)).length > MAX_PAYLOAD_BYTES) {
    throw new FormatError(`${p}.payload: larger than ${MAX_PAYLOAD_BYTES} bytes`);
  }
  if (payload.ceremony_id !== ceremonyId || payload.seq !== seq) {
    throw new FormatError(`${p}.payload: signed for another ceremony or session`);
  }
  return {
    type: "attestation",
    ceremony_id: ceremonyId,
    seq,
    payload,
    scheme,
    signature: asStoredSignature(o.signature, `${p}.signature`, scheme),
  };
}
