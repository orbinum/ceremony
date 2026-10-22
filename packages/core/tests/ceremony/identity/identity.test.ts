/**
 * Accounts, signatures, client builds and identities as the transcript records them. SPEC §3.4,
 * §6.3.
 */
import { describe, expect, it } from "vitest";
import {
  asAccount,
  asClientInfo,
  asIdentity,
  asStoredSignature,
  asWalletSignature,
  evmAccountKey,
  LOCAL_BUILD,
  validateAttestationPayload,
} from "../../../src/ceremony/identity";

/** EIP-55 vectors from the EIP itself. */
const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const SS58 = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

const contribution = (circuit: string, index = 1) => ({
  circuit,
  index,
  input_sha256: "11".repeat(32),
  output_sha256: "22".repeat(32),
  contribution_hash: "33".repeat(64),
});
const payload = (contributions: unknown[]) => ({
  ceremony_id: "c-1",
  github_id: 7,
  account: CHECKSUMMED,
  seq: 1,
  contributions,
  client: { name: "web", version: "1.0.0", commit: "abc1234" },
});

describe("accounts (SPEC §3.4)", () => {
  it("accepts an EVM address in lowercase, uppercase or valid EIP-55 form", () => {
    expect(asAccount(CHECKSUMMED, "a", "eip712")).toBe(CHECKSUMMED);
    expect(asAccount(CHECKSUMMED.toLowerCase(), "a", "eip712")).toBe(CHECKSUMMED.toLowerCase());
    const upper = `0x${CHECKSUMMED.slice(2).toUpperCase()}`;
    expect(asAccount(upper, "a", "eip712")).toBe(upper);
  });

  it("refuses a mixed-case address with a wrong checksum (a typo), and the other scheme's form", () => {
    const typo = `${CHECKSUMMED.slice(0, -1)}D`;
    expect(() => asAccount(typo, "a", "eip712")).toThrow("a: bad EIP-55 checksum");
    expect(() => asAccount(SS58, "a", "eip712")).toThrow(/^a:/);
    expect(() => asAccount(CHECKSUMMED, "a", "sr25519")).toThrow(/^a:/);
    expect(asAccount(SS58, "a", "sr25519")).toBe(SS58);
  });

  it("keys one EVM wallet once, whatever its spelling", () => {
    expect(evmAccountKey(CHECKSUMMED)).toBe(evmAccountKey(CHECKSUMMED.toLowerCase()));
  });
});

describe("signatures (SPEC §3.6–3.7)", () => {
  it("stores exactly 65 or 64 bytes for EVM and 64 for sr25519", () => {
    expect(asStoredSignature("ab".repeat(65), "s", "eip712")).toHaveLength(130);
    expect(asStoredSignature("ab".repeat(64), "s", "eip712")).toHaveLength(128);
    expect(asStoredSignature("ab".repeat(64), "s", "sr25519")).toHaveLength(128);
    for (const [sig, scheme] of [
      ["", "eip712"],
      ["ab".repeat(63), "eip712"],
      ["ab".repeat(65), "sr25519"],
      ["AB".repeat(65), "eip712"],
      ["a".repeat(129), "eip712"],
    ] as const) {
      expect(() => asStoredSignature(sig, "s", scheme)).toThrow(/^s:/);
    }
  });

  it("accepts what a wallet returns (0x, either case) at the right size", () => {
    expect(asWalletSignature(`0x${"AB".repeat(65)}`, "s", "eip712")).toBe(`0x${"AB".repeat(65)}`);
    expect(() => asWalletSignature("ab".repeat(65), "s", "eip712")).toThrow(/^s:/);
    expect(() => asWalletSignature(`0x${"ab".repeat(66)}`, "s", "eip712")).toThrow(/^s:/);
  });
});

describe("client builds and identities", () => {
  it("requires a hex commit, except the explicit local marker in simulated records", () => {
    const local = { name: "cli", version: "0.0.0", commit: LOCAL_BUILD };
    expect(() => asClientInfo(local, "c")).toThrow("c.commit: does not match /^[0-9a-f]{7,40}$/");
    expect(asClientInfo(local, "c", { allowLocal: true }).commit).toBe("local");
    expect(() => asClientInfo({ ...local, name: "" }, "c", { allowLocal: true })).toThrow(
      /c\.name/,
    );
    expect(() => asClientInfo({ ...local, extra: 1 }, "c", { allowLocal: true })).toThrow(
      /unexpected field/,
    );
  });

  it("validates a transcript identity under its scheme's rules", () => {
    const id = {
      github_id: 7,
      github_login: "octocat",
      account: CHECKSUMMED,
      scheme: "eip712",
      nonce: "ab".repeat(32),
      issued_at: 1_790_000_000,
    };
    expect(asIdentity(id, "i")).toEqual(id);
    expect(() => asIdentity({ ...id, github_login: "-bad-" }, "i")).toThrow(/i\.github_login/);
    expect(() => asIdentity({ ...id, github_id: 0 }, "i")).toThrow(/i\.github_id/);
    expect(() => asIdentity({ ...id, scheme: "sr25519" }, "i")).toThrow(/i\.account/);
    expect(() => asIdentity({ ...id, nonce: "AB".repeat(32) }, "i")).toThrow(/i\.nonce/);
    expect(() => asIdentity({ ...id, issued_at: -1 }, "i")).toThrow(/i\.issued_at/);
    const { nonce: _, ...withoutLink } = id;
    expect(() => asIdentity(withoutLink, "i")).toThrow(/missing field "nonce"/);
  });
});

describe("attestation payloads have one signable form (SPEC §3.5)", () => {
  it("accepts circuits in session order", () => {
    const p = validateAttestationPayload(
      payload([contribution("shield"), contribution("transfer")]),
      "eip712",
    );
    expect(p.contributions.map((c) => c.circuit)).toEqual(["shield", "transfer"]);
  });

  it.each([
    ["no contribution", []],
    ["a repeated circuit", [contribution("shield"), contribution("shield", 2)]],
    ["circuits out of order", [contribution("transfer"), contribution("shield")]],
  ])("refuses %s", (_, contributions) => {
    expect(() => validateAttestationPayload(payload(contributions), "eip712")).toThrow(
      /attestation\.contributions/,
    );
  });
});
