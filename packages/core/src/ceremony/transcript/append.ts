/** Appending to the chain: nothing malformed ever enters a transcript. SPEC §6.3. */
import { headChain, nextChain } from "./chain";
import type { Chained, TranscriptRecord } from "./types";
import { validateRecord } from "./validate";

/** Validates `record`, then chains it after `records` (or `genesis` for the first one). */
export function appendRecord<R extends TranscriptRecord>(
  records: readonly Chained[],
  genesis: string,
  record: R,
): Chained<R> {
  const valid = validateRecord(record) as R;
  const prev = headChain(records, genesis);
  return { ...valid, prev_chain: prev, chain: nextChain(prev, valid) };
}
