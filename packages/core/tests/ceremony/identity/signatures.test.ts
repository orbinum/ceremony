/**
 * What wallets sign, EIP-712 typed data and sr25519 messages, pinned by fixed vectors from a fixed
 * test key (never a real wallet): a change to a vector changes what wallets sign.
 */
import { Keyring } from "@polkadot/keyring";
import { u8aWrapBytes } from "@polkadot/util";
import { cryptoWaitReady, signatureVerify } from "@polkadot/util-crypto";
import { TypedDataEncoder, Wallet, verifyTypedData } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AttestationPayload,
  attestationTypedData,
  eip712Domain,
  type LinkPayload,
  linkTypedData,
  sr25519Message,
  type TypedData,
  validateAttestationPayload,
  validateLinkPayload,
} from "../../../src/ceremony/identity";
import { FormatError } from "../../../src/primitives/errors";

const evm = new Wallet(`0x${"01".repeat(32)}`);

const link = (account: string): LinkPayload => ({
  ceremony_id: "orbinum-testnet-rehearsal-1",
  github_id: 583231,
  github_login: "octocat",
  account,
  nonce: "ab".repeat(32),
  issued_at: 1_791_504_000,
});

const attestation = (account: string): AttestationPayload => ({
  ceremony_id: "orbinum-testnet-rehearsal-1",
  github_id: 583231,
  account,
  seq: 7,
  contributions: [
    {
      circuit: "shield",
      index: 3,
      input_sha256: "11".repeat(32),
      output_sha256: "22".repeat(32),
      contribution_hash: "33".repeat(64),
    },
  ],
  client: { name: "orbinum-ceremony-web", version: "0.1.0", commit: "abcdef1" },
});

function forEthers<P extends "Link" | "Attestation">(t: TypedData<P>) {
  const { EIP712Domain: _domain, ...types } = t.types as Record<string, unknown>;
  return [t.domain, types as Record<string, { name: string; type: string }[]>, t.message] as const;
}

describe("EIP-712", () => {
  it("binds the domain to the ceremony with the salt, and has no chainId", () => {
    const d = eip712Domain("orbinum-testnet-rehearsal-1");
    expect(d).toEqual({
      name: "Orbinum Trusted Setup",
      version: "1",
      salt: "0xb4a3289ec0050901bbdd59b3e9fe0559118fb2f7819ddce7976505b8411ab0a9",
    });
    expect(eip712Domain("orbinum-mainnet-1").salt).not.toBe(d.salt);
  });

  it("produces a link a wallet signs and the coordinator recovers", async () => {
    const [domain, types, message] = forEthers(linkTypedData(link(evm.address)));
    const signature = await evm.signTypedData(domain, types, message);
    expect(verifyTypedData(domain, types, message, signature)).toBe(evm.address);
  });

  it("produces an attestation a wallet signs and the coordinator recovers", async () => {
    const [domain, types, message] = forEthers(attestationTypedData(attestation(evm.address)));
    const signature = await evm.signTypedData(domain, types, message);
    expect(verifyTypedData(domain, types, message, signature)).toBe(evm.address);
  });

  it("does not verify a link signature as an attestation, nor across ceremonies", async () => {
    const [domain, types, message] = forEthers(linkTypedData(link(evm.address)));
    const signature = await evm.signTypedData(domain, types, message);
    const [aDomain, aTypes, aMessage] = forEthers(attestationTypedData(attestation(evm.address)));
    expect(verifyTypedData(aDomain, aTypes, aMessage, signature)).not.toBe(evm.address);
    const other = linkTypedData({ ...link(evm.address), ceremony_id: "orbinum-mainnet-1" });
    const [oDomain, oTypes, oMessage] = forEthers(other);
    expect(verifyTypedData(oDomain, oTypes, oMessage, signature)).not.toBe(evm.address);
  });

  it("keeps the signed digests stable (fixed vectors)", () => {
    const linkHash = TypedDataEncoder.hash(...forEthers(linkTypedData(link(evm.address))));
    const attHash = TypedDataEncoder.hash(
      ...forEthers(attestationTypedData(attestation(evm.address))),
    );
    expect(linkHash).toBe("0x8585d9707031d29ba6b62219056665d537caecc3a122b2c5cb7513b710378d37");
    expect(attHash).toBe("0x96d137f034886742f9e9e9a294b1d7612dc3ef58f94c7d5a713577f7f3ab724f");
  });
});

describe("sr25519", () => {
  let pair: ReturnType<Keyring["addFromUri"]>;
  beforeAll(async () => {
    await cryptoWaitReady();
    pair = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri("//Alice");
  });

  it("is the prefix, the type and the payload as RFC 8785 JSON", () => {
    expect(sr25519Message("link", link(pair.address))).toBe(
      "Orbinum Trusted Setup v1\nlink\n" +
        `{"account":"${pair.address}","ceremony_id":"orbinum-testnet-rehearsal-1",` +
        `"github_id":583231,"github_login":"octocat","issued_at":1791504000,` +
        `"nonce":"${"ab".repeat(32)}"}`,
    );
  });

  it("verifies a plain signature and the <Bytes>-wrapped one extensions produce", () => {
    const message = sr25519Message("link", link(pair.address));
    const plain = pair.sign(message);
    const wrapped = pair.sign(u8aWrapBytes(message));
    expect(signatureVerify(message, plain, pair.address).isValid).toBe(true);
    expect(signatureVerify(message, wrapped, pair.address).isValid).toBe(true);
  });

  it("does not verify a link signature as an attestation", () => {
    const signature = pair.sign(sr25519Message("link", link(pair.address)));
    const other = sr25519Message("attestation", attestation(pair.address));
    expect(signatureVerify(other, signature, pair.address).isValid).toBe(false);
  });
});

describe("payload validation", () => {
  it("accepts the payloads; the nonce must be exactly as issued (it is part of the signed text)", () => {
    expect(validateLinkPayload(link(evm.address), "eip712").nonce).toBe(link(evm.address).nonce);
    expect(() =>
      validateLinkPayload({ ...link(evm.address), nonce: "AB".repeat(32) }, "eip712"),
    ).toThrow(/link\.nonce/);
    expect(validateAttestationPayload(attestation(evm.address), "eip712").seq).toBe(7);
  });

  it.each([
    ["an extra field", { extra: 1 }],
    ["a short nonce", { nonce: "ab" }],
    [
      "an SS58 account for an EVM link",
      { account: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" },
    ],
    ["an invalid GitHub login", { github_login: "-bad-" }],
    ["a GitHub id of 0", { github_id: 0 }],
  ])("rejects a link with %s", (_, patch) => {
    expect(() => validateLinkPayload({ ...link(evm.address), ...patch }, "eip712")).toThrow(
      FormatError,
    );
  });

  it("rejects an attestation with more contributions than circuits, or uppercase hashes", () => {
    const many = {
      ...attestation(evm.address),
      contributions: Array(17).fill(attestation(evm.address).contributions[0]),
    };
    expect(() => validateAttestationPayload(many, "eip712")).toThrow(
      /attestation\.contributions: more than 16 items/,
    );
    const upper = attestation(evm.address);
    upper.contributions[0] = { ...upper.contributions[0]!, contribution_hash: "AA".repeat(64) };
    expect(() => validateAttestationPayload(upper, "eip712")).toThrow(
      /contributions\[0\]\.contribution_hash: expected 64-byte lowercase hex/,
    );
  });
});
