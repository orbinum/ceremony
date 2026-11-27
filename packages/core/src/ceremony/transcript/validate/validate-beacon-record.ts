/**
 * Strict schema of a beacon record: a drand round with canonical hex, iterations in the allowed
 * range, and one to `MAX_RELAYS` relay names.
 */
import { BEACON_ITERATIONS_RANGE, MAX_RELAYS } from "../../../config";
import {
  asArray,
  asCeremonyId,
  asHex,
  asIsoTime,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asString,
  NONEMPTY_PRINTABLE,
} from "../../../primitives/schema";
import type { BeaconRecord } from "../types";

export function validateBeaconRecord(v: unknown, p: string): BeaconRecord {
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
