/**
 * The hash chain rooted in the announcement:
 * chain_0 = SHA-256( UTF-8(ceremony_id) ‖ SHA-256(JCS(announcement)) ),
 * chain_n = SHA-256( chain_{n-1} ‖ SHA-256(JCS(record_n)) ), over raw digest bytes. SPEC §6.3.
 */
import { fromHex, utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { canonicalJson, createSha256, sha256Bytes } from "../../primitives/hashing";
import type { Chained, TranscriptRecord } from "./types";

/** chain_0 of a ceremony. */
export const chainGenesis = (ceremonyId: string, announcement: unknown): string =>
  createSha256()
    .update(utf8(ceremonyId))
    .update(sha256Bytes(utf8(canonicalJson(announcement))))
    .digestHex();

/** chain_n from chain_{n-1} and record_n (without its chain fields). */
export const nextChain = (prev: string, record: TranscriptRecord): string =>
  createSha256()
    .update(fromHex(prev))
    .update(sha256Bytes(utf8(canonicalJson(record))))
    .digestHex();

/** The chain value after the last record. */
export const headChain = (records: readonly Chained[], genesis: string): string =>
  records.at(-1)?.chain ?? genesis;

/** Recomputes every link; a record that cannot be serialized breaks the chain where it sits. */
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
