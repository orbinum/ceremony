/**
 * A 32-byte public key as an SS58 address (simple prefixes, 0–63), without @polkadot: how a Solana
 * wallet's ed25519 key reads as an Orbinum account.
 */
import { toBase58 } from "../../primitives/encoding";
import { ORBINUM_SS58_PREFIX } from "./constants";
import { ss58Checksum } from "./ss58-checksum";

export function ss58Address(publicKey: Uint8Array, prefix = ORBINUM_SS58_PREFIX): string {
  if (publicKey.length !== 32) throw new Error("an SS58 account is a 32-byte public key");
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 63) throw new Error("SS58 prefix 0–63");
  const body = new Uint8Array([prefix, ...publicKey]);
  return toBase58(new Uint8Array([...body, ...ss58Checksum(body)]));
}
