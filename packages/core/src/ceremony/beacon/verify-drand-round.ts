/**
 * Whether a drand quicknet round is genuine: the BLS signature (G1, RFC 9380 hash-to-curve)
 * verifies under the pinned group key over SHA-256(round as u64 big-endian), unchained, and
 * `randomness = SHA-256(signature)`.
 */
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { DRAND } from "../../config";
import { fromHex } from "../../primitives/encoding";
import { sha256Bytes, sha256Hex } from "../../primitives/hashing";
import type { DrandRound } from "./types";

function roundMessage(round: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(round));
  return sha256Bytes(buf);
}

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
