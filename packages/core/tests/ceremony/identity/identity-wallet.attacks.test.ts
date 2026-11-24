/**
 * Attacks wallet link and attestation signatures and their validators (SPEC §3.3–3.9, KL-32):
 * cross-domain replay, malleated or misspelled signatures, account spellings and hostile payloads.
 */
import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { Signature, TypedDataEncoder, Wallet } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  accountKey,
  asAccount,
  asStoredSignature,
  asWalletSignature,
  type AttestationPayload,
  attestationTypedData,
  eip712Domain,
  ethersTypedData,
  type LinkPayload,
  linkTypedData,
  sr25519Message,
  validateAttestationPayload,
  validateAttestationRequest,
  validateLinkPayload,
  validateLinkRequest,
  verifyAttestation,
  verifyLink,
} from "../../../src/ceremony/identity";
import { checkAttestation, checkLink } from "../../../src/coordination/attestation";
import { LINK_RULES } from "../../../src/config";

const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

const evm = new Wallet(`0x${"05".repeat(32)}`);
const other = new Wallet(`0x${"06".repeat(32)}`);
const hashOf = (typed: ReturnType<typeof ethersTypedData>) => TypedDataEncoder.hash(...typed);
const signTyped = (w: Wallet, typed: ReturnType<typeof ethersTypedData>) =>
  w.signingKey.sign(hashOf(typed)).serialized;

const link = (account: string, over: Partial<LinkPayload> = {}): LinkPayload => ({
  ceremony_id: "unit-test-1",
  github_id: 7,
  github_login: "octocat",
  account,
  nonce: "ab".repeat(32),
  issued_at: 1_790_000_000,
  ...over,
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

const linkSig = (w: Wallet, p: LinkPayload) => signTyped(w, ethersTypedData(linkTypedData(p)));
const at = (s: number) => s * 1000;
const signSr = (k: KeyringPair, msg: string | Uint8Array) => u8aToHex(k.sign(msg));

describe("EIP-712 domain and primary type", () => {
  const p = link(evm.address);

  it("refuses a signature made under a domain with chainId", () => {
    const [domain, types, message] = ethersTypedData(linkTypedData(p));
    const withChain = { ...domain, chainId: 1 };
    const sig = evm.signingKey.sign(TypedDataEncoder.hash(withChain, types, message)).serialized;
    expect(verifyLink("eip712", p, sig)).toBe(false);
  });

  it("refuses a signature made for another ceremony (salt and payload)", () => {
    const sigOther = linkSig(evm, link(evm.address, { ceremony_id: "unit-test-2" }));
    expect(verifyLink("eip712", p, sigOther)).toBe(false);
    // Same payload ceremony_id but domain salt of another ceremony.
    const [, types, message] = ethersTypedData(linkTypedData(p));
    const sig = evm.signingKey.sign(
      TypedDataEncoder.hash(eip712Domain("unit-test-2"), types, message),
    ).serialized;
    expect(verifyLink("eip712", p, sig)).toBe(false);
  });

  it("refuses a link signature as an attestation and vice versa (primaryType)", () => {
    const a = attestation(evm.address);
    const aSig = signTyped(evm, ethersTypedData(attestationTypedData(a)));
    expect(verifyLink("eip712", p, aSig)).toBe(false);
    expect(verifyAttestation("eip712", a, linkSig(evm, p))).toBe(false);
  });

  it("refuses a signature by another address than the payload's account", () => {
    expect(verifyLink("eip712", p, linkSig(other, p))).toBe(false);
  });

  it("never recovers the zero address (garbage signature for account 0x0)", () => {
    const zero = link(`0x${"00".repeat(20)}`);
    expect(accountKey("eip712", zero.account)).toBe(`0x${"00".repeat(20)}`); // accepted shape
    for (const s of [`0x${"00".repeat(65)}`, `0x${"00".repeat(64)}1b`, `0x${"ff".repeat(65)}`]) {
      expect(verifyLink("eip712", zero, s)).toBe(false);
    }
  });
});

describe("EIP-712 signature spellings", () => {
  const p = link(evm.address);
  const sig = linkSig(evm, p);
  const parsed = Signature.from(sig);

  it("accepts v = 27/28 and 0/1 for the same signature (several spellings, same signer)", () => {
    const body = sig.slice(2, 130);
    const v = Number.parseInt(sig.slice(130), 16);
    expect(verifyLink("eip712", p, `0x${body}${v.toString(16)}`)).toBe(true);
    expect(verifyLink("eip712", p, `0x${body}${(v - 27).toString(16).padStart(2, "0")}`)).toBe(
      true,
    );
    // The other parity recovers another key: refused.
    const flipped = v === 27 ? "1c" : "1b";
    expect(verifyLink("eip712", p, `0x${body}${flipped}`)).toBe(false);
    // v out of range.
    expect(verifyLink("eip712", p, `0x${body}1d`)).toBe(false);
    expect(verifyLink("eip712", p, `0x${body}02`)).toBe(false);
  });

  it("accepts the EIP-2098 compact form", () => {
    expect(verifyLink("eip712", p, parsed.compactSerialized)).toBe(true);
    expect(asWalletSignature(parsed.compactSerialized, "s", "eip712")).toBe(
      parsed.compactSerialized,
    );
  });

  it("refuses the high-s malleated twin (n - s, flipped v)", () => {
    const highS = (N - BigInt(parsed.s)).toString(16).padStart(64, "0");
    const v = parsed.v === 27 ? "1c" : "1b";
    const twin = `0x${parsed.r.slice(2)}${highS}${v}`;
    expect(verifyLink("eip712", p, twin)).toBe(false);
  });

  it("refuses a signature of a wrong size before verification (63, 66 bytes)", () => {
    expect(() => asWalletSignature(`0x${"11".repeat(63)}`, "s", "eip712")).toThrow(
      /not a eip712 signature/,
    );
    expect(() => asWalletSignature(`0x${"11".repeat(66)}`, "s", "eip712")).toThrow(
      /longer than 132/,
    );
    expect(() => asWalletSignature("11".repeat(65), "s", "eip712")).toThrow(/does not match/);
    // The stored form is bare lowercase hex.
    expect(() => asStoredSignature(`0x${"11".repeat(65)}`, "s", "eip712")).toThrow(
      /longer than 130/,
    );
    expect(() => asStoredSignature("AB".repeat(65), "s", "eip712")).toThrow(
      /expected 65-byte lowercase hex/,
    );
  });
});

describe("EVM account spellings", () => {
  const lower = evm.address.toLowerCase();
  const upper = `0x${evm.address.slice(2).toUpperCase()}`;

  it("maps lowercase, checksummed and all-uppercase to one key", () => {
    const keys = [lower, evm.address, upper].map((a) => accountKey("eip712", a));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(lower);
  });

  it("refuses a mixed-case address with a wrong checksum, and 0X / short forms", () => {
    const body = evm.address.slice(2);
    const i = [...body].findIndex((c) => /[a-fA-F]/.test(c));
    const c = body[i] as string;
    const swapped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
    const typo = `0x${body.slice(0, i)}${swapped}${body.slice(i + 1)}`;
    expect(() => asAccount(typo, "a", "eip712")).toThrow(/checksum/);
    expect(accountKey("eip712", typo)).toBeNull();
    expect(accountKey("eip712", `0X${body}`)).toBeNull();
    expect(accountKey("eip712", evm.address.slice(0, 41))).toBeNull();
  });

  it("verifies one signature for every spelling of the account (address is typed)", () => {
    const sig = linkSig(evm, link(evm.address));
    for (const a of [lower, evm.address, upper]) {
      expect(verifyLink("eip712", link(a), sig)).toBe(true);
    }
  });
});

describe("payload validators", () => {
  const p = link(evm.address);

  it("refuse extra, missing and prototype fields", () => {
    expect(() => validateLinkPayload({ ...p, extra: 1 }, "eip712")).toThrow(
      /unexpected field "extra"/,
    );
    const { nonce: _n, ...missing } = p;
    expect(() => validateLinkPayload(missing, "eip712")).toThrow(/missing field "nonce"/);
    expect(() =>
      validateLinkPayload(
        JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(p).slice(1)}`),
        "eip712",
      ),
    ).toThrow(/unexpected field "__proto__"/);
    expect(() =>
      validateLinkRequest({
        scheme: "eip712",
        payload: p,
        signature: `0x${"11".repeat(65)}`,
        x: 1,
      }),
    ).toThrow(/unexpected field "x"/);
  });

  it("refuse unicode, whitespace and confusables in the login", () => {
    for (const login of [
      "octocat ",
      " octocat",
      "octo cat",
      "octoсat", // Cyrillic es
      "octocat\n",
      "octocat​",
      "-octocat",
      "octocat-",
      "a".repeat(40),
      "",
    ]) {
      expect(() => validateLinkPayload({ ...p, github_login: login }, "eip712")).toThrow(
        /link\.github_login: /,
      );
    }
  });

  it("accept one value per JSON number spelling (the signature is over the value)", () => {
    const text = JSON.stringify(p).replace(`"issued_at":${p.issued_at}`, '"issued_at":1.79e9');
    const parsed = validateLinkPayload(JSON.parse(text), "eip712");
    expect(parsed.issued_at).toBe(1_790_000_000);
    expect(verifyLink("eip712", parsed, linkSig(evm, p))).toBe(true);
    for (const github_id of [Number.MAX_SAFE_INTEGER + 1, 1.5, "7"]) {
      expect(() => validateLinkPayload({ ...p, github_id }, "eip712")).toThrow(
        /link\.github_id: expected an integer/,
      );
    }
    expect(() => validateLinkPayload({ ...p, issued_at: 2 ** 40 + 1 }, "eip712")).toThrow(
      /link\.issued_at: expected an integer/,
    );
    for (const nonce of ["AB".repeat(32), `0x${"ab".repeat(32)}`]) {
      expect(() => validateLinkPayload({ ...p, nonce }, "eip712")).toThrow(
        /link\.nonce: expected 32-byte lowercase hex/,
      );
    }
  });

  it("refuse attestation hashes of the wrong form, repeated circuits, extra fields", () => {
    const a = attestation(evm.address);
    const c0 = a.contributions[0]!;
    const bad = (contributions: unknown[]) => ({ ...a, contributions });
    expect(() => validateAttestationPayload(bad([{ ...c0, index: 0 }]), "eip712")).toThrow(
      /index: expected an integer/,
    );
    expect(() => validateAttestationPayload(bad([c0, c0]), "eip712")).toThrow(
      /a circuit appears twice/,
    );
    expect(() => validateAttestationPayload(bad([{ ...c0, circuit: "Shield" }]), "eip712")).toThrow(
      /circuit: does not match/,
    );
    expect(() =>
      validateAttestationPayload(bad([{ ...c0, contribution_hash: "33".repeat(32) }]), "eip712"),
    ).toThrow(/contribution_hash: expected 64-byte lowercase hex/);
    expect(() => validateAttestationPayload(bad([{ ...c0, extra: 1 }]), "eip712")).toThrow(
      /contributions\[0\]: unexpected field "extra"/,
    );
    expect(() => validateAttestationPayload({ ...a, extra: 1 }, "eip712")).toThrow(
      /attestation: unexpected field "extra"/,
    );
    expect(() =>
      validateAttestationRequest(
        { payload: a, signature: `0x${"11".repeat(65)}`, extra: 1 },
        "eip712",
      ),
    ).toThrow(/unexpected field "extra"/);
    // An EVM account under an sr25519 attestation.
    expect(() => validateAttestationPayload(a, "sr25519")).toThrow(/attestation\.account: /);
  });
});

describe("link and attestation checks against the session", () => {
  const p = link(evm.address);
  const session = { ceremonyId: "unit-test-1", githubId: 7, githubLogin: "octocat" };

  it("bounds issued_at by the skew both ways, inclusive at exactly 10 min", () => {
    expect(checkLink(p, session, at(p.issued_at + LINK_RULES.maxSkewS))).toBeNull();
    expect(checkLink(p, session, at(p.issued_at - LINK_RULES.maxSkewS))).toBeNull();
    expect(checkLink(p, session, at(p.issued_at + LINK_RULES.maxSkewS) + 1)).toBe(
      "stale-signature",
    );
    expect(checkLink(p, session, at(p.issued_at - LINK_RULES.maxSkewS) - 1)).toBe(
      "stale-signature",
    );
  });

  it("refuses another login spelling (case) or GitHub id", () => {
    expect(checkLink({ ...p, github_login: "OctoCat" }, session, at(p.issued_at))).toBe(
      "wrong-identity",
    );
    expect(checkLink({ ...p, github_id: 8 }, session, at(p.issued_at))).toBe("wrong-identity");
  });

  it("refuses an attestation whose account is another spelling of the linked one", () => {
    // Same wallet, other case: refused by a strict string compare.
    const a = attestation(evm.address.toLowerCase());
    expect(
      checkAttestation(a, { ceremonyId: "unit-test-1", githubId: 7, account: evm.address }, []),
    ).toBe("attestation-mismatch");
  });
});

describe("sr25519 signatures", () => {
  let pair: KeyringPair;
  let ed: KeyringPair;
  let ecdsa: KeyringPair;
  beforeAll(async () => {
    await cryptoWaitReady();
    pair = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri("//wallet-sr");
    ed = new Keyring({ type: "ed25519", ss58Format: 42 }).addFromUri("//wallet-sr");
    ecdsa = new Keyring({ type: "ecdsa", ss58Format: 42 }).addFromUri("//wallet-sr");
  });

  it("accepts plain and <Bytes>-wrapped, refuses other wrappers", () => {
    const p = link(pair.address);
    const m = sr25519Message("link", p);
    expect(verifyLink("sr25519", p, signSr(pair, m))).toBe(true);
    expect(verifyLink("sr25519", p, signSr(pair, `<Bytes>${m}</Bytes>`))).toBe(true);
    expect(verifyLink("sr25519", p, signSr(pair, `<bytes>${m}</bytes>`))).toBe(false);
    expect(verifyLink("sr25519", p, signSr(pair, `${m}\n`))).toBe(false);
    expect(
      verifyLink("sr25519", p, signSr(pair, `\x19Ethereum Signed Message:\n${m.length}${m}`)),
    ).toBe(false);
  });

  it("refuses a link signature as an attestation (type line)", () => {
    const p = link(pair.address);
    const s = signSr(pair, sr25519Message("link", p));
    expect(verifyAttestation("sr25519", attestation(pair.address), s)).toBe(false);
  });

  it("refuses ed25519 and ecdsa signatures by an address of the same key bytes", () => {
    const pe = link(ed.address);
    expect(verifyLink("sr25519", pe, signSr(ed, sr25519Message("link", pe)))).toBe(false);
    // ECDSA: the account is blake2(33-byte key), a valid SS58 shape; the 65-byte signature is
    // outside sr25519's size and does not verify as sr25519.
    expect(accountKey("sr25519", ecdsa.address)).not.toBeNull();
    const pe2 = link(ecdsa.address);
    const ecSig = signSr(ecdsa, sr25519Message("link", pe2));
    expect(() => asWalletSignature(ecSig, "s", "sr25519")).toThrow(/longer than 130/);
    expect(verifyLink("sr25519", pe2, ecSig)).toBe(false);
  });

  it("maps one key under several prefixes to one account_key (KL-32)", () => {
    const pk = decodeAddress(pair.address);
    const spellings = [0, 2, 42, 63].map((f) => encodeAddress(pk, f));
    const keys = spellings.map((a) => accountKey("sr25519", a));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(u8aToHex(pk));
  });

  it("refuses hex public keys, bad checksums and two-byte prefixes as accounts", () => {
    const pk = decodeAddress(pair.address);
    expect(accountKey("sr25519", u8aToHex(pk))).toBeNull();
    const a = pair.address;
    const last = a.at(-1) === "1" ? "2" : "1";
    expect(accountKey("sr25519", `${a.slice(0, -1)}${last}`)).toBeNull();
    expect(verifyLink("sr25519", link(`${a.slice(0, -1)}${last}`), `0x${"11".repeat(64)}`)).toBe(
      false,
    );
    expect(accountKey("sr25519", encodeAddress(pk, 2254))).toBeNull();
  });

  it("verifies a signature with or without 0x, any case; the wallet form requires 0x", () => {
    const p = link(pair.address);
    const s = signSr(pair, sr25519Message("link", p));
    expect(verifyLink("sr25519", p, s.slice(2))).toBe(true);
    expect(verifyLink("sr25519", p, `0x${s.slice(2).toUpperCase()}`)).toBe(true);
    expect(() => asWalletSignature(s.slice(2), "s", "sr25519")).toThrow(/does not match/);
    expect(asWalletSignature(`0x${s.slice(2).toUpperCase()}`, "s", "sr25519")).toBeTruthy();
  });

  it("binds the SS58 spelling: a signature over one prefix does not verify for another", () => {
    const p = link(pair.address);
    const s = signSr(pair, sr25519Message("link", p));
    const relabeled = link(encodeAddress(decodeAddress(pair.address), 0));
    expect(verifyLink("sr25519", relabeled, s)).toBe(false);
  });
});
