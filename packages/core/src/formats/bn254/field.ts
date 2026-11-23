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

/**
 * Fq element in Montgomery little-endian (zkey storage) → its canonical value. A stored value ≥ Fq
 * is refused: it would decode to the same point under another spelling.
 */
export function fqLemToBigInt(lem: Uint8Array): bigint {
  const m = leToBigInt(lem);
  if (m >= BN254_FQ) throw new FormatError("field element out of range");
  return (m * R_INV) % BN254_FQ;
}

/** Fq element in Montgomery little-endian → canonical big-endian at `out[offset]`. */
export function fqLemToBe(lem: Uint8Array, out: Uint8Array, offset: number): void {
  bigIntToBe(fqLemToBigInt(lem), out, offset);
}
