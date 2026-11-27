/**
 * Recomputes every link of the hash chain from the genesis; a record that cannot be serialized
 * breaks the chain where it sits.
 */
import { FormatError } from "../../primitives/errors";
import { nextChain } from "./next-chain";
import type { Chained, TranscriptRecord } from "./types";

export function verifyChain(
  records: readonly Chained[],
  genesis: string,
): { ok: true; head: string } | { ok: false; position: number } {
  let prev = genesis;
  for (const [position, { prev_chain, chain, ...record }] of records.entries()) {
    let expected: string;
    try {
      expected = nextChain(prev, record as TranscriptRecord);
    } catch (error) {
      if (error instanceof FormatError) return { ok: false, position };
      throw error;
    }
    if (prev_chain !== prev || chain !== expected) return { ok: false, position };
    prev = chain;
  }
  return { ok: true, head: prev };
}
