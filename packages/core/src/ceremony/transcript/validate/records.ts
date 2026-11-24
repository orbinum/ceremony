/**
 * Strict schema per record type: exact fields, canonical hex, bounded printable strings, and the
 * same field rules the online paths apply (identities, client builds, signatures). SPEC §6.3.
 */
import { BEACON_ITERATIONS_RANGE, MAX_PAYLOAD_BYTES, MAX_RELAYS } from "../../../config";
import { utf8 } from "../../../primitives/encoding";
import { FormatError } from "../../../primitives/errors";
import { canonicalJson } from "../../../primitives/hashing";
import {
  asArray,
  asCeremonyId,
  asCircuitName,
  asHex,
  asIsoTime,
  asNullable,
  asObject,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asString,
  asU32,
  NONEMPTY_PRINTABLE,
  ZKEY_NAME,
} from "../../../primitives/schema";
import {
  asClientInfo,
  asIdentity,
  asStoredSignature,
  CONTRIBUTION_METHODS,
  SCHEMES,
  validateAttestationPayload,
} from "../../identity";
import { CEREMONY_STATES } from "../../lifecycle";
import type {
  AttestationRecord,
  BeaconRecord,
  ContributionRecord,
  StateRecord,
  TranscriptRecord,
} from "../types";

const GIST_URL = /^https:\/\/gist\.github\.com\/[\x21-\x7e]+$/;

function contribution(v: unknown, p: string): ContributionRecord {
  const o = asRecord(v, p, [
    "type",
    "ceremony_id",
    "seq",
    "circuit",
    "index",
    "input_sha256",
    "output_sha256",
    "contribution_hash",
    "client_contribution_hash",
    "zkey_name",
    "delta_after",
    "method",
    "client",
    "identity",
    "link_sig",
    "gist_url",
    "verified_by",
    "verifier_log_sha256",
  ]);
  const by = asRecord(o.verified_by, `${p}.verified_by`, [
    "verifier_version",
    "snarkjs_version",
    "at",
  ]);
  const identity = asNullable(o.identity, (x) => asIdentity(x, `${p}.identity`));
  const linkSig = asNullable(o.link_sig, (x) =>
    asStoredSignature(x, `${p}.link_sig`, identity?.scheme ?? "eip712"),
  );
  if ((identity === null) !== (linkSig === null)) {
    throw new FormatError(`${p}.link_sig: present exactly when identity is`);
  }
  return {
    type: "contribution",
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    seq: asU32(o.seq, `${p}.seq`),
    circuit: asCircuitName(o.circuit, `${p}.circuit`),
    index: asU32(o.index, `${p}.index`),
    input_sha256: asHex(o.input_sha256, `${p}.input_sha256`, 32),
    output_sha256: asHex(o.output_sha256, `${p}.output_sha256`, 32),
    contribution_hash: asHex(o.contribution_hash, `${p}.contribution_hash`, 64),
    client_contribution_hash: asHex(
      o.client_contribution_hash,
      `${p}.client_contribution_hash`,
      64,
    ),
    zkey_name: asString(o.zkey_name, `${p}.zkey_name`, 64, ZKEY_NAME),
    delta_after: asHex(o.delta_after, `${p}.delta_after`, 64),
    method: asOneOf(o.method, `${p}.method`, CONTRIBUTION_METHODS),
    client: asClientInfo(o.client, `${p}.client`, { allowLocal: true }),
    identity,
    link_sig: linkSig,
    gist_url: asNullable(o.gist_url, (x) => asString(x, `${p}.gist_url`, 200, GIST_URL)),
    verified_by: {
      verifier_version: asString(
        by.verifier_version,
        `${p}.verified_by.verifier_version`,
        32,
        NONEMPTY_PRINTABLE,
      ),
      snarkjs_version: asString(
        by.snarkjs_version,
        `${p}.verified_by.snarkjs_version`,
        16,
        NONEMPTY_PRINTABLE,
      ),
      at: asIsoTime(by.at, `${p}.verified_by.at`),
    },
    verifier_log_sha256: asHex(o.verifier_log_sha256, `${p}.verifier_log_sha256`, 32),
  };
}

/** The payload is the one the wallet signed: validated for the record's scheme, same session. */
function attestation(v: unknown, p: string): AttestationRecord {
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

function state(v: unknown, p: string): StateRecord {
  const o = asRecord(v, p, ["type", "ceremony_id", "from", "to", "at", "reason"]);
  return {
    type: "state",
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    from: asOneOf(o.from, `${p}.from`, CEREMONY_STATES),
    to: asOneOf(o.to, `${p}.to`, CEREMONY_STATES),
    at: asIsoTime(o.at, `${p}.at`),
    reason: asString(o.reason, `${p}.reason`, 200, NONEMPTY_PRINTABLE),
  };
}

function beacon(v: unknown, p: string): BeaconRecord {
  const o = asRecord(v, p, [
    "type",
    "ceremony_id",
    "source",
    "chain_hash",
    "round",
    "randomness",
    "signature",
    "iterations_exp",
    "relays",
    "sealed_at",
  ]);
  return {
    type: "beacon",
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    source: asOneOf(o.source, `${p}.source`, ["drand"] as const),
    chain_hash: asHex(o.chain_hash, `${p}.chain_hash`, 32),
    round: asPositiveInt(o.round, `${p}.round`),
    randomness: asHex(o.randomness, `${p}.randomness`, 32),
    signature: asHex(o.signature, `${p}.signature`, 48),
    iterations_exp: asSafeInt(
      o.iterations_exp,
      `${p}.iterations_exp`,
      BEACON_ITERATIONS_RANGE.min,
      BEACON_ITERATIONS_RANGE.max,
    ),
    relays: asArray(o.relays, `${p}.relays`, MAX_RELAYS, 1).map((r, i) =>
      asString(r, `${p}.relays[${i}]`, 100, NONEMPTY_PRINTABLE),
    ),
    sealed_at: asIsoTime(o.sealed_at, `${p}.sealed_at`),
  };
}

const BY_TYPE = { contribution, attestation, state, beacon } as const;

/** Validates one record of any type. */
export function validateRecord(v: unknown, p = "record"): TranscriptRecord {
  const type = asOneOf(
    asObject(v, p).type,
    `${p}.type`,
    Object.keys(BY_TYPE) as (keyof typeof BY_TYPE)[],
  );
  return BY_TYPE[type](v, p);
}
