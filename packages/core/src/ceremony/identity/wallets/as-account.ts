/**
 * A wallet account of a scheme, as the wallet reports it. EVM accounts may be lowercase or EIP-55
 * checksummed (a mixed-case address with a wrong checksum is a typo, refused); SS58 accounts must
 * carry a valid checksum and their one spelling.
 */
import { toHex, utf8 } from "../../../primitives/encoding";
import { FormatError } from "../../../primitives/errors";
import { keccak256 } from "../../../primitives/hashing";
import { asString } from "../../../primitives/schema";
import { ss58PublicKey } from "../ss58";
import type { Scheme } from "../types";

const EVM_ACCOUNT = /^0x[0-9a-fA-F]{40}$/;
const SS58_ACCOUNT = /^[1-9A-HJ-NP-Za-km-z]{46,48}$/;

function isChecksummed(address: string): boolean {
  const body = address.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  const hash = toHex(keccak256(utf8(body.toLowerCase())));
  return [...body].every((c, i) => {
    if (!/[a-f]/i.test(c)) return true;
    const upper = Number.parseInt(hash[i] as string, 16) >= 8;
    return upper ? c === c.toUpperCase() : c === c.toLowerCase();
  });
}

export function asAccount(value: unknown, path: string, scheme: Scheme): string {
  if (scheme !== "eip712") {
    const account = asString(value, path, 48, SS58_ACCOUNT);
    try {
      ss58PublicKey(account);
    } catch (error) {
      throw new FormatError(`${path}: ${(error as Error).message}`);
    }
    return account;
  }
  const account = asString(value, path, 42, EVM_ACCOUNT);
  if (!isChecksummed(account)) throw new FormatError(`${path}: bad EIP-55 checksum`);
  return account;
}
