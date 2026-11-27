/**
 * An Fq element in Montgomery little-endian (zkey storage) to its canonical value, dividing out
 * R = 2^256 mod Fq. A stored value ≥ Fq is refused: it would decode to the same point under
 * another spelling.
 */
import { FormatError } from "../../../primitives/errors";
import { BN254_FQ } from "../constants";

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
  }
  return result;
}

const R_INV = modPow(2n ** 256n % BN254_FQ, BN254_FQ - 2n, BN254_FQ);

function leToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] as number);
  return v;
}

export function fqLemToBigInt(lem: Uint8Array): bigint {
  const m = leToBigInt(lem);
  if (m >= BN254_FQ) throw new FormatError("field element out of range");
  return (m * R_INV) % BN254_FQ;
}
