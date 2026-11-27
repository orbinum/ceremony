/** A job id with the contribution index it would take, as job specs and reports carry it. */
import { asCircuitName, asRecord, asU32 } from "../../../primitives/schema";
import type { JobId } from "../types";

export function validateIndexedJob(v: unknown, p: string): JobId & { index: number } {
  const o = asRecord(v, p, ["seq", "circuit", "attempt", "index"]);
  return {
    seq: asU32(o.seq, `${p}.seq`),
    circuit: asCircuitName(o.circuit, `${p}.circuit`),
    attempt: asU32(o.attempt, `${p}.attempt`),
    index: asU32(o.index, `${p}.index`),
  };
}
