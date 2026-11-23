/**
 * Wallet accounts and signatures per scheme. EVM accounts may be lowercase or EIP-55 checksummed
 * (a mixed-case address with a wrong checksum is a typo, refused); SS58 checksums are verified
 * where the signature is, in the coordinator (KL-32). SPEC §3.4–3.7.
 */
import { toHex, utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { keccak256 } from "../../primitives/hashing";
import { asHex, asString } from "../../primitives/schema";
import type { Scheme } from "./types";

const EVM_ACCOUNT = /^0x[0-9a-fA-F]{40}$/;
const SS58_ACCOUNT = /^[1-9A-HJ-NP-Za-km-z]{46,48}$/;

/** Signature sizes in bytes: ECDSA r‖s‖v (65, or 64 in EIP-2098 compact form), sr25519 and ed25519. */
const SIGNATURE_BYTES: Record<Scheme, readonly number[]> = {
  eip712: [65, 64],
  sr25519: [64],
  ed25519: [64],
};

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

/** An account of `scheme`, as the wallet reports it. */
export function asAccount(value: unknown, path: string, scheme: Scheme): string {
  if (scheme !== "eip712") return asString(value, path, 48, SS58_ACCOUNT);
  const account = asString(value, path, 42, EVM_ACCOUNT);
  if (!isChecksummed(account)) throw new FormatError(`${path}: bad EIP-55 checksum`);
  return account;
}

/** The form under which one EVM key is unique (case is not part of an address). */
export const evmAccountKey = (account: string): string => account.toLowerCase();

/** A stored signature: lowercase hex without `0x`, of the exact size for `scheme`. */
export function asStoredSignature(value: unknown, path: string, scheme: Scheme): string {
  const sizes = SIGNATURE_BYTES[scheme];
  const s = asString(value, path, 2 * Math.max(...sizes));
  const bytes = s.length / 2;
  if (!sizes.includes(bytes)) throw new FormatError(`${path}: not a ${scheme} signature`);
  return asHex(s, path, bytes);
}

/** A signature as a wallet returns it (`0x` + hex, either case), of the exact size for `scheme`. */
export function asWalletSignature(value: unknown, path: string, scheme: Scheme): string {
  const s = asString(value, path, 2 + 2 * Math.max(...SIGNATURE_BYTES[scheme]), /^0x[0-9a-fA-F]+$/);
  asStoredSignature(s.slice(2).toLowerCase(), path, scheme);
  return s;
}
