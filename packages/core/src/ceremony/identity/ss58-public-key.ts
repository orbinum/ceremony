/**
 * The 32-byte public key of an SS58 address (a one- or two-byte network prefix), without
 * @polkadot: refused unless its checksum holds and it is the one spelling of those bytes. Every
 * reader of an account checks it.
 */
import { fromBase58, toBase58 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { ss58Checksum } from "./ss58-checksum";

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
  const [a, b] = ss58Checksum(body);
  if (bytes[prefixBytes + 32] !== a || bytes[prefixBytes + 33] !== b) {
    throw new FormatError("bad SS58 checksum");
  }
  if (toBase58(bytes) !== address) throw new FormatError("not the SS58 spelling of its bytes");
  return bytes.slice(prefixBytes, prefixBytes + 32);
}
