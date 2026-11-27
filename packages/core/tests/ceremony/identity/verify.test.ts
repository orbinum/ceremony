/**
 * Wallet signatures verify over the exact signed bytes, under their own scheme only (fixed test
 * keys, never real wallets).
 */
import { Keyring } from "@polkadot/keyring";
import { u8aToHex, u8aWrapBytes } from "@polkadot/util";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { TypedDataEncoder, Wallet } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  accountKey,
  type AttestationPayload,
  attestationTypedData,
  ethersTypedData,
  type LinkPayload,
  linkTypedData,
  sr25519Message,
  ss58Address,
  verifyAttestation,
  verifyLink,
} from "../../../src/ceremony/identity";

const evm = new Wallet(`0x${"02".repeat(32)}`);
const other = new Wallet(`0x${"03".repeat(32)}`);
const signTyped = (w: Wallet, typed: ReturnType<typeof ethersTypedData>) =>
  w.signingKey.sign(TypedDataEncoder.hash(...typed)).serialized;

const link = (account: string): LinkPayload => ({
  ceremony_id: "unit-test-1",
  github_id: 7,
  github_login: "octocat",
  account,
  nonce: "ab".repeat(32),
  issued_at: 1_790_000_000,
});

const attestation = (account: string): AttestationPayload => ({
  ceremony_id: "unit-test-1",
  github_id: 7,
  account,
  seq: 3,
  contributions: [
    {
      circuit: "shield",
      index: 1,
      input_sha256: "11".repeat(32),
      output_sha256: "22".repeat(32),
      contribution_hash: "33".repeat(64),
    },
  ],
  client: { name: "web", version: "1.0.0", commit: "abc1234" },
});

describe("EIP-712 signatures", () => {
  const p = link(evm.address);
  const sig = signTyped(evm, ethersTypedData(linkTypedData(p)));

  it("verify for the account that signed, in any of the forms a signature is stored", () => {
    expect(verifyLink("eip712", p, sig)).toBe(true);
    expect(verifyLink("eip712", p, sig.slice(2).toUpperCase())).toBe(true);
    expect(verifyLink("eip712", { ...p, account: evm.address.toLowerCase() }, sig)).toBe(true);
  });

  it("refuse another signer, another payload field, and a link replayed as an attestation", () => {
    expect(verifyLink("eip712", { ...p, account: other.address }, sig)).toBe(false);
    expect(verifyLink("eip712", { ...p, nonce: "cd".repeat(32) }, sig)).toBe(false);
    expect(verifyLink("eip712", { ...p, issued_at: p.issued_at + 1 }, sig)).toBe(false);
    expect(verifyLink("eip712", { ...p, ceremony_id: "unit-test-2" }, sig)).toBe(false);
    expect(verifyAttestation("eip712", attestation(evm.address), sig)).toBe(false);
    expect(verifyLink("eip712", p, `0x${"11".repeat(65)}`)).toBe(false);
    expect(verifyLink("eip712", p, "not a signature")).toBe(false);
  });

  it("verify an attestation by its account only", () => {
    const a = attestation(evm.address);
    const asig = signTyped(evm, ethersTypedData(attestationTypedData(a)));
    expect(verifyAttestation("eip712", a, asig)).toBe(true);
    expect(verifyAttestation("eip712", { ...a, seq: 4 }, asig)).toBe(false);
    expect(verifyAttestation("sr25519", a, asig)).toBe(false);
  });
});

describe("sr25519 signatures", () => {
  let pair: ReturnType<Keyring["addFromUri"]>;
  let ed: ReturnType<Keyring["addFromUri"]>;
  beforeAll(async () => {
    await cryptoWaitReady();
    pair = new Keyring({ type: "sr25519" }).addFromUri("//Alice");
    ed = new Keyring({ type: "ed25519" }).addFromUri("//Alice");
  });

  it("verify plain and <Bytes>-wrapped, for the signing account", () => {
    const p = link(pair.address);
    const message = sr25519Message("link", p);
    expect(verifyLink("sr25519", p, u8aToHex(pair.sign(message)))).toBe(true);
    expect(verifyLink("sr25519", p, u8aToHex(pair.sign(u8aWrapBytes(message))))).toBe(true);
    expect(verifyLink("sr25519", { ...p, github_id: 8 }, u8aToHex(pair.sign(message)))).toBe(false);
  });

  it("refuse an ed25519 signature by the account's own key: the scheme is sr25519 only", () => {
    const p = link(ed.address);
    expect(verifyLink("sr25519", p, u8aToHex(ed.sign(sr25519Message("link", p))))).toBe(false);
  });

  it("refuse a link signature as an attestation", () => {
    const sig = u8aToHex(pair.sign(sr25519Message("link", link(pair.address))));
    expect(verifyAttestation("sr25519", attestation(pair.address), sig)).toBe(false);
  });
});

describe("ed25519 signatures (Solana wallets, Ledger accounts)", () => {
  let ed: ReturnType<Keyring["addFromUri"]>;
  let sr: ReturnType<Keyring["addFromUri"]>;
  beforeAll(async () => {
    await cryptoWaitReady();
    ed = new Keyring({ type: "ed25519" }).addFromUri("//Solana");
    sr = new Keyring({ type: "sr25519" }).addFromUri("//Solana");
  });

  it("verify bare (solana:signMessage) and <Bytes>-wrapped (signRaw), for the signing account", () => {
    const p = link(ed.address);
    const message = sr25519Message("link", p);
    expect(verifyLink("ed25519", p, u8aToHex(ed.sign(message)))).toBe(true);
    expect(verifyLink("ed25519", p, u8aToHex(ed.sign(u8aWrapBytes(message))))).toBe(true);
    expect(verifyLink("ed25519", { ...p, github_id: 8 }, u8aToHex(ed.sign(message)))).toBe(false);
  });

  it("refuse a signature of the other SS58 scheme, whichever way round", () => {
    const pe = link(ed.address);
    const ps = link(sr.address);
    expect(verifyLink("sr25519", pe, u8aToHex(ed.sign(sr25519Message("link", pe))))).toBe(false);
    expect(verifyLink("ed25519", ps, u8aToHex(sr.sign(sr25519Message("link", ps))))).toBe(false);
  });

  it("refuse a link signature as an attestation", () => {
    const sig = u8aToHex(ed.sign(sr25519Message("link", link(ed.address))));
    expect(verifyAttestation("ed25519", attestation(ed.address), sig)).toBe(false);
  });
});

describe("SS58 addresses of a public key", () => {
  it("are those @polkadot encodes, for the Orbinum prefix and others", async () => {
    await cryptoWaitReady();
    for (const uri of ["//Alice", "//Bob", "//Solana"]) {
      const pair = new Keyring({ type: "ed25519", ss58Format: 42 }).addFromUri(uri);
      expect(ss58Address(pair.publicKey)).toBe(pair.address);
      expect(ss58Address(pair.publicKey, 0)).toBe(encodeAddress(pair.publicKey, 0));
      expect(accountKey("ed25519", ss58Address(pair.publicKey))).toBe(u8aToHex(pair.publicKey));
    }
    expect(() => ss58Address(new Uint8Array(31))).toThrow(/32-byte/);
  });
});

describe("account keys", () => {
  it("are one per key: EVM case-insensitive, SS58 independent of the network prefix", async () => {
    await cryptoWaitReady();
    expect(accountKey("eip712", evm.address)).toBe(evm.address.toLowerCase());
    expect(accountKey("eip712", evm.address.toLowerCase())).toBe(evm.address.toLowerCase());
    const alice = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri("//Alice");
    const polkadot = new Keyring({ type: "sr25519", ss58Format: 0 }).addFromUri("//Alice");
    expect(alice.address).not.toBe(polkadot.address);
    expect(accountKey("sr25519", alice.address)).toBe(accountKey("sr25519", polkadot.address));
    expect(accountKey("sr25519", alice.address)).toBe(u8aToHex(alice.publicKey));
  });

  it("are null for an account that is not an address of the scheme", () => {
    expect(accountKey("eip712", "0x1234")).toBeNull();
    expect(accountKey("sr25519", evm.address)).toBeNull();
    expect(accountKey("sr25519", "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQZ")).toBeNull();
  });
});
