/**
 * An SS58 address of a 32-byte public key: how a Solana wallet's ed25519 key reads as an Orbinum
 * account, computed without @polkadot so the browser need not load it.
 */
import { fromHex, toBase58, utf8 } from "../../primitives/encoding";
import { blake2b512Hex } from "../../primitives/hashing";

/** The SS58 network prefix of Orbinum accounts. */
export const ORBINUM_SS58_PREFIX = 42;

/** `publicKey` as an SS58 address (simple prefixes, 0–63). */
export function ss58Address(publicKey: Uint8Array, prefix = ORBINUM_SS58_PREFIX): string {
  if (publicKey.length !== 32) throw new Error("an SS58 account is a 32-byte public key");
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 63) throw new Error("SS58 prefix 0–63");
  const body = new Uint8Array([prefix, ...publicKey]);
  const checksum = fromHex(blake2b512Hex(new Uint8Array([...utf8("SS58PRE"), ...body]))).slice(
    0,
    2,
  );
  return toBase58(new Uint8Array([...body, ...checksum]));
}
