/**
 * The raw public key behind an SS58 account, refused when no single secret can hold it: an ed25519
 * key outside the prime-order subgroup, or the all-zero sr25519 key (the ristretto identity, for
 * which Schnorrkel signatures are forgeable).
 */
import { decodeAddress } from "@polkadot/util-crypto";
import { FormatError } from "../../../primitives/errors";
import { primeOrderPoint } from "./prime-order-point";
import type { Scheme } from "../types";

export function walletPublicKey(scheme: Scheme, account: string): Uint8Array {
  const key = decodeAddress(account);
  if (scheme === "ed25519") primeOrderPoint(key);
  if (scheme === "sr25519" && key.every((b) => b === 0)) throw new FormatError("identity key");
  return key;
}
