/** BN254 field constants and the Montgomery decoding snarkjs files need. */
import { FormatError } from "../../primitives/errors";

/** Base field modulus Fq. */
export const BN254_FQ =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/** Scalar field modulus Fr, big-endian hex (as an r1cs header stores the prime). */
export const BN254_FR = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

/** Bytes of one Fq element. */
export const FQ_BYTES = 32;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
  }
  return result;
}

/** Inverse of the Montgomery factor R = 2^256 mod Fq. */
const R_INV = modPow(2n ** 256n % BN254_FQ, BN254_FQ - 2n, BN254_FQ);

function leToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] as number);
  return v;
}

function bigIntToBe(v: bigint, out: Uint8Array, offset: number): void {
  for (let i = FQ_BYTES - 1; i >= 0; i--) {
    out[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

/** Fq as 32 little-endian bytes, for comparisons on stored elements without decoding them. */
const FQ_LE = (() => {
  const out = new Uint8Array(FQ_BYTES);
  let v = BN254_FQ;
  for (let i = 0; i < FQ_BYTES; i++, v >>= 8n) out[i] = Number(v & 0xffn);
  return out;
})();

/** Whether the 32-byte little-endian value at `bytes[offset]` is below Fq. */
function belowFq(bytes: Uint8Array, offset: number): boolean {
  for (let i = FQ_BYTES - 1; i >= 0; i--) {
    const b = bytes[offset + i] as number;
    const q = FQ_LE[i] as number;
    if (b !== q) return b < q;
  }
  return false;
}

/**
 * Throws `FormatError` unless `bytes` is a whole number of stored Fq elements, each below Fq: the
 * only spelling a key has. Linear in the size, without allocating.
 */
export function checkCanonicalFq(bytes: Uint8Array, what: string): void {
  if (bytes.length % FQ_BYTES !== 0)
    throw new FormatError(`${what}: not a sequence of Fq elements`);
  for (let at = 0; at < bytes.length; at += FQ_BYTES) {
    if (!belowFq(bytes, at)) throw new FormatError(`${what}: field element out of range at ${at}`);
  }
}

/**
 * Fq element in Montgomery little-endian (zkey storage) → canonical big-endian at `out[offset]`.
 * A stored value ≥ Fq is refused: it would decode to the same point under another spelling.
 */
export function fqLemToBe(lem: Uint8Array, out: Uint8Array, offset: number): void {
  const m = leToBigInt(lem);
  if (m >= BN254_FQ) throw new FormatError("field element out of range");
  bigIntToBe((m * R_INV) % BN254_FQ, out, offset);
}
