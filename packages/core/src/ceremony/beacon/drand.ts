/** drand quicknet rounds: timing and BLS verification against the pinned key. SPEC §5. */
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { DRAND } from "../../config";
import { fromHex } from "../../primitives/encoding";
import { sha256Bytes, sha256Hex } from "../../primitives/hashing";

/** A drand round as served by `GET /<chain_hash>/public/<round>`. */
export interface DrandRound {
  round: number;
  randomness: string;
  signature: string;
}

/** Unix time (s) at which `round` is emitted: rounds start at 1 on the chain's genesis. */
export const roundTime = (round: number): number =>
  DRAND.genesisTime + (round - 1) * DRAND.periodSeconds;

/** First round emitted at or after `unixSeconds` (SPEC §5.2). */
export function roundAt(unixSeconds: number): number {
  if (unixSeconds <= DRAND.genesisTime) return 1;
  return Math.ceil((unixSeconds - DRAND.genesisTime) / DRAND.periodSeconds) + 1;
}

/** quicknet signs SHA-256(round as u64 big-endian), unchained. */
function roundMessage(round: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(round));
  return sha256Bytes(buf);
}

/**
 * True iff the BLS signature (G1, RFC 9380 hash-to-curve) verifies under the pinned group key for
 * this round, and `randomness = SHA-256(signature)` (SPEC §5.4).
 */
export function verifyDrandRound(r: DrandRound): boolean {
  if (!Number.isSafeInteger(r.round) || r.round < 1) return false;
  try {
    const sig = fromHex(r.signature);
    if (sha256Hex(sig) !== r.randomness) return false;
    const bls = bls12_381.shortSignatures;
    return bls.verify(sig, bls.hash(roundMessage(r.round)), fromHex(DRAND.publicKey));
  } catch {
    return false;
  }
}
