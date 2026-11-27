/**
 * One link of the hash chain, from chain_{n-1} and record_n without its chain fields:
 * chain_n = SHA-256( chain_{n-1} ‖ SHA-256(JCS(record_n)) ), over raw digest bytes.
 */
import { fromHex, utf8 } from "../../primitives/encoding";
import { canonicalJson, createSha256, sha256Bytes } from "../../primitives/hashing";
import type { TranscriptRecord } from "./types";

export const nextChain = (prev: string, record: TranscriptRecord): string =>
  createSha256()
    .update(fromHex(prev))
    .update(sha256Bytes(utf8(canonicalJson(record))))
    .digestHex();
