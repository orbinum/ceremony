/**
 * The whole `transcript.json` read from outside: every record valid and of this ceremony, at most
 * one final per circuit. The chain itself is checked by `verifyChain`, its meaning by
 * `checkTranscript`.
 */
import { MAX_CIRCUITS, MAX_RECORDS } from "../../../config";
import { FormatError } from "../../../primitives/errors";
import {
  asArray,
  asCeremonyId,
  asHex,
  asObject,
  asOneOf,
  asRecord,
  asSchema,
} from "../../../primitives/schema";
import { TRANSCRIPT_SCHEMA } from "../constants";
import type { Chained, Transcript } from "../types";
import { validateFinalRecord } from "./validate-final-record";
import { validateRecord } from "./validate-record";

function chained(v: unknown, p: string): Chained {
  const { prev_chain, chain, ...record } = asObject(v, p);
  return {
    ...validateRecord(record, p),
    prev_chain: asHex(prev_chain, `${p}.prev_chain`, 32),
    chain: asHex(chain, `${p}.chain`, 32),
  };
}

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
  const finals = asArray(o.finals, "transcript.finals", MAX_CIRCUITS).map((f, i) =>
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
