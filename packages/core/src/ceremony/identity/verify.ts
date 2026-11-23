/**
 * Wallet signatures over the exact bytes this module's typed data and messages define: EIP-712 with
 * ethers, sr25519 with @polkadot/util-crypto, ed25519 with one strict rule of our own (below), so the
 * Worker, the CLI and the browser agree on every record. SPEC §3.4–3.7.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { u8aToHex, u8aWrapBytes } from "@polkadot/util";
import { decodeAddress, signatureVerify } from "@polkadot/util-crypto";
import { getAddress, verifyTypedData } from "ethers";
import { fromHex, hex0x, normalizeSignature, utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { asAccount, evmAccountKey } from "./account";
import { attestationTypedData, linkTypedData } from "./eip712";
import { ethersTypedData } from "./ethers";
import { sr25519Message } from "./sr25519";
import type { AttestationPayload, LinkPayload, Scheme } from "./types";

/**
 * An ed25519 point that only one secret can stand behind: canonically encoded, of prime order. The
 * library default (ZIP-215, cofactored) also takes small-order and torsion-mixed points, which let a
 * keyless "key" verify anything and one secret sign for eight keys, and its JS and wasm backends
 * disagree on them (the Worker runs the JS one).
 */
function primeOrderPoint(bytes: Uint8Array): void {
  const point = ed25519.Point.fromBytes(bytes, false);
  if (point.isSmallOrder() || !point.isTorsionFree()) {
    throw new FormatError("ed25519 point outside the prime-order subgroup");
  }
}

/** The raw public key behind an SS58 account, refused when no single secret can hold it. */
function ss58PublicKey(scheme: Scheme, account: string): Uint8Array {
  const key = decodeAddress(account);
  if (scheme === "ed25519") primeOrderPoint(key);
  // The ristretto identity: Schnorrkel signatures for it are forgeable.
  if (scheme === "sr25519" && key.every((b) => b === 0)) throw new FormatError("identity key");
  return key;
}

/**
 * The wallet's canonical key, so the same key cannot be linked twice under two spellings: the
 * lowercase address for EVM, the public key for an SS58 account (one key has an SS58 form per
 * network prefix). Null if the account is not a valid address of its scheme.
 */
export function accountKey(scheme: Scheme, account: string): string | null {
  try {
    asAccount(account, "account", scheme);
    return scheme === "eip712"
      ? evmAccountKey(getAddress(account))
      : u8aToHex(ss58PublicKey(scheme, account));
  } catch {
    return null;
  }
}

/** RFC 8032 ed25519 with canonical encodings and prime-order key and R, bare or `<Bytes>`-wrapped. */
function verifyEd25519(text: string, signature: string, account: string): boolean {
  const key = ss58PublicKey("ed25519", account);
  const sig = fromHex(normalizeSignature(signature));
  primeOrderPoint(sig.subarray(0, 32));
  const message = utf8(text);
  return [message, u8aWrapBytes(message)].some((m) =>
    ed25519.verify(sig, m, key, { zip215: false }),
  );
}

type Signed =
  | { kind: "link"; payload: LinkPayload }
  | { kind: "attestation"; payload: AttestationPayload };

/**
 * Whether `signature` (`0x` optional, either case) is the payload's account signing it: EIP-712
 * typed data recovered to the account, or sr25519 / ed25519 over the prefixed JCS message (plain,
 * as Solana wallets sign it, or `<Bytes>`-wrapped, as extensions do).
 */
function verifySigned(scheme: Scheme, signed: Signed, signature: string): boolean {
  const sig = hex0x(normalizeSignature(signature));
  try {
    if (scheme === "eip712") {
      const typed =
        signed.kind === "link"
          ? ethersTypedData(linkTypedData(signed.payload))
          : ethersTypedData(attestationTypedData(signed.payload));
      return verifyTypedData(...typed, sig) === getAddress(signed.payload.account);
    }
    const message =
      signed.kind === "link"
        ? sr25519Message("link", signed.payload)
        : sr25519Message("attestation", signed.payload);
    if (scheme === "ed25519") return verifyEd25519(message, sig, signed.payload.account);
    ss58PublicKey(scheme, signed.payload.account);
    // @polkadot accepts every curve it knows; only the one the scheme names counts.
    const result = signatureVerify(message, sig, signed.payload.account);
    return result.isValid && result.crypto === scheme;
  } catch {
    return false;
  }
}

/** Whether a link payload is signed by its account under `scheme`. */
export const verifyLink = (scheme: Scheme, payload: LinkPayload, signature: string): boolean =>
  verifySigned(scheme, { kind: "link", payload }, signature);

/** Whether an attestation payload is signed by its account under `scheme`. */
export const verifyAttestation = (
  scheme: Scheme,
  payload: AttestationPayload,
  signature: string,
): boolean => verifySigned(scheme, { kind: "attestation", payload }, signature);
