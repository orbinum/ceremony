/**
 * The EIP-712 domain every ceremony message is signed under. `chainId` is deliberately absent (the
 * ceremony is off-chain); `salt = keccak256(utf8(ceremony_id))` binds the domain to one ceremony,
 * so a signature for one ceremony never verifies for another.
 */
import { hex0x, toHex, utf8 } from "../../primitives/encoding";
import { keccak256 } from "../../primitives/hashing";
import type { Eip712Domain } from "./types";

export function eip712Domain(ceremonyId: string): Eip712Domain {
  return {
    name: "Orbinum Trusted Setup",
    version: "1",
    salt: hex0x(toHex(keccak256(utf8(ceremonyId)))),
  };
}
