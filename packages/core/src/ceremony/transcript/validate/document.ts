/** The whole `transcript.json`, as read from outside. SPEC §6.3–6.4. */
import { CIRCUIT_ORDER, MAX_RECORDS } from "../../../config";
import { FormatError } from "../../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asCount,
  asHex,
  asNullable,
  asObject,
  asOneOf,
  asRecord,
  asSchema,
  asString,
} from "../../../primitives/schema";
import { type Chained, type FinalRecord, TRANSCRIPT_SCHEMA, type Transcript } from "../types";
import { validateRecord } from "./records";

function chained(v: unknown, p: string): Chained {
  const { prev_chain, chain, ...record } = asObject(v, p);
  return {
    ...validateRecord(record, p),
    prev_chain: asHex(prev_chain, `${p}.prev_chain`, 32),
    chain: asHex(chain, `${p}.chain`, 32),
  };
}

/** One final record (SPEC §6.4): exact fields, canonical hex, `vk_hash` as the chain stores it. */
export function validateFinalRecord(v: unknown, p = "final"): FinalRecord {
  const o = asRecord(v, p, [
    "circuit",
    "contributions",
    "final_zkey_sha256",
    "vk_json_sha256",
    "vk_hash",
    "cs_hash",
    "delta_neq_gamma",
    "final_chain",
  ]);
  if (o.delta_neq_gamma !== true) throw new FormatError(`${p}.delta_neq_gamma: must be true`);
  return {
    circuit: asOneOf(o.circuit, `${p}.circuit`, CIRCUIT_ORDER),
    contributions: asCount(o.contributions, `${p}.contributions`),
    final_zkey_sha256: asHex(o.final_zkey_sha256, `${p}.final_zkey_sha256`, 32),
    vk_json_sha256: asHex(o.vk_json_sha256, `${p}.vk_json_sha256`, 32),
    vk_hash: asNullable(o.vk_hash, (x) => asString(x, `${p}.vk_hash`, 66, /^0x[0-9a-f]{64}$/)),
    cs_hash: asHex(o.cs_hash, `${p}.cs_hash`, 64),
    delta_neq_gamma: true,
    final_chain: asHex(o.final_chain, `${p}.final_chain`, 32),
  };
}

/**
 * Validates a whole transcript: every record of this ceremony, at most one final per circuit.
 * The chain itself is checked by `verifyChain`, its meaning by `checkTranscript`.
 */
export function validateTranscript(v: unknown): Transcript {
  const o = asRecord(v, "transcript", ["schema", "ceremony_id", "anchor", "records", "finals"]);
  const anchor = asRecord(o.anchor, "transcript.anchor", ["file", "sha256"]);
  const ceremonyId = asCeremonyId(o.ceremony_id, "transcript.ceremony_id");
  const records = asArray(o.records, "transcript.records", MAX_RECORDS).map((r, i) =>
    chained(r, `transcript.records[${i}]`),
  );
  const foreign = records.findIndex((r) => r.ceremony_id !== ceremonyId);
  if (foreign !== -1) {
    throw new FormatError(`transcript.records[${foreign}]: belongs to another ceremony`);
  }
  const finals = asArray(o.finals, "transcript.finals", CIRCUIT_ORDER.length).map((f, i) =>
    validateFinalRecord(f, `transcript.finals[${i}]`),
  );
  if (new Set(finals.map((f) => f.circuit)).size !== finals.length) {
    throw new FormatError("transcript.finals: a circuit appears twice");
  }
  return {
    schema: asSchema(o.schema, "transcript.schema", TRANSCRIPT_SCHEMA),
    ceremony_id: ceremonyId,
    anchor: {
      file: asOneOf(anchor.file, "transcript.anchor.file", ["ceremony.json"] as const),
      sha256: asHex(anchor.sha256, "transcript.anchor.sha256", 32),
    },
    records,
    finals,
  };
}
