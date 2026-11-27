/**
 * SS58 accounts read in core: the checksum and the one spelling hold, as @polkadot decodes them,
 * so a typo'd account is refused wherever an account is read, not only where a signature is.
 */
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { describe, expect, it } from "vitest";
import { asAccount, ss58Address, ss58PublicKey } from "../../../../src/ceremony/identity";
import { fromBase58, toBase58 } from "../../../../src/primitives/encoding";

const key = (seed: number) => Uint8Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7) & 0xff);

describe("SS58 accounts", () => {
  it("decodes what @polkadot encodes, for one- and two-byte network prefixes", () => {
    for (const prefix of [0, 2, 42, 63, 64, 1000, 16_383]) {
      for (const seed of [1, 2, 3]) {
        const address = encodeAddress(key(seed), prefix);
        expect(ss58PublicKey(address)).toEqual(decodeAddress(address));
      }
    }
    expect(ss58PublicKey(ss58Address(key(9)))).toEqual(key(9));
  });

  it("refuses a typo, another checksum, a short key and a non-base58 text", () => {
    const address = ss58Address(key(5));
    const typo = `${address.slice(0, 10)}${address[10] === "a" ? "b" : "a"}${address.slice(11)}`;
    const bytes = fromBase58(address);
    bytes[bytes.length - 1] = (bytes.at(-1) as number) ^ 1;
    for (const bad of [
      typo,
      toBase58(bytes),
      toBase58(fromBase58(address).subarray(0, 34)),
      "0OIl",
    ]) {
      expect(() => ss58PublicKey(bad)).toThrow(/SS58/);
      expect(() => asAccount(bad, "account", "sr25519")).toThrow(/^account: /);
    }
    expect(asAccount(address, "account", "ed25519")).toBe(address);
  });

  it("round-trips base58 with leading zero bytes", () => {
    for (const bytes of [new Uint8Array([0, 0, 1, 2]), new Uint8Array([255]), new Uint8Array()]) {
      expect(fromBase58(toBase58(bytes))).toEqual(bytes);
    }
  });
});
