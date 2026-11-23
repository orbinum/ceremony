/** EIP-55: some wallets refuse to sign for an address written in lowercase. */
import { keccak256, toHex, utf8 } from "@orbinum-ceremony/core";

/** `address` in its mixed-case checksum form. */
export function toChecksumAddress(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error(`not an EVM address: ${address}`);
  const hash = toHex(keccak256(utf8(hex)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const c = hex[i] as string;
    out += Number.parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}
