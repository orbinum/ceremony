/**
 * SS58 addresses of 32-byte public keys, both ways and without @polkadot (the browser need not
 * load it): how a Solana wallet's ed25519 key reads as an Orbinum account, and the checksum every
 * reader of an account checks.
 */
import { fromBase58, fromHex, toBase58, utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { blake2b512Hex } from "../../primitives/hashing";

const checksumOf = (body: Uint8Array) =>
  fromHex(blake2b512Hex(new Uint8Array([...utf8("SS58PRE"), ...body]))).slice(0, 2);

/** The SS58 network prefix of Orbinum accounts. */
export const ORBINUM_SS58_PREFIX = 42;

/** `publicKey` as an SS58 address (simple prefixes, 0–63). */
export function ss58Address(publicKey: Uint8Array, prefix = ORBINUM_SS58_PREFIX): string {
  if (publicKey.length !== 32) throw new Error("an SS58 account is a 32-byte public key");
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 63) throw new Error("SS58 prefix 0–63");
  const body = new Uint8Array([prefix, ...publicKey]);
  return toBase58(new Uint8Array([...body, ...checksumOf(body)]));
}

/**
 * The 32-byte public key of an SS58 address (a one- or two-byte network prefix), refused unless
 * its checksum holds and it is the one spelling of those bytes.
 */
export function ss58PublicKey(address: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = fromBase58(address);
  } catch {
    throw new FormatError("not an SS58 address");
  }
  const prefixBytes = (bytes[0] ?? 0) < 64 ? 1 : 2;
  if ((bytes[0] ?? 0) >= 128 || bytes.length !== prefixBytes + 32 + 2) {
    throw new FormatError("not an SS58 address of a 32-byte key");
  }
  const body = bytes.subarray(0, prefixBytes + 32);
  const [a, b] = checksumOf(body);
  if (bytes[prefixBytes + 32] !== a || bytes[prefixBytes + 33] !== b) {
    throw new FormatError("bad SS58 checksum");
  }
  if (toBase58(bytes) !== address) throw new FormatError("not the SS58 spelling of its bytes");
  return bytes.slice(prefixBytes, prefixBytes + 32);
}
