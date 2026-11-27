/**
 * Appends to the hash chain: validates a record, then chains it after the records (or the genesis
 * for the first one), so nothing malformed ever enters a transcript.
 */
import { headChain } from "./head-chain";
import { nextChain } from "./next-chain";
import type { Chained, TranscriptRecord } from "../types";
import { validateRecord } from "../validate";

export function appendRecord<R extends TranscriptRecord>(
  records: readonly Chained[],
  genesis: string,
  record: R,
): Chained<R> {
  const valid = validateRecord(record) as R;
  const prev = headChain(records, genesis);
  return { ...valid, prev_chain: prev, chain: nextChain(prev, valid) };
}
