/**
 * Wallet signatures, verified with the wallets' own libraries (ethers, @polkadot/util-crypto) over
 * the exact bytes this module's typed data and messages define. SPEC §3.4–3.7.
 */
import { u8aToHex } from "@polkadot/util";
import { decodeAddress, signatureVerify } from "@polkadot/util-crypto";
import { getAddress, verifyTypedData } from "ethers";
import { hex0x, normalizeSignature } from "../../primitives/encoding";
import { asAccount, evmAccountKey } from "./account";
import { attestationTypedData, linkTypedData } from "./eip712";
import { ethersTypedData } from "./ethers";
import { sr25519Message } from "./sr25519";
import type { AttestationPayload, LinkPayload, Scheme } from "./types";

/**
 * The wallet's canonical key, so the same key cannot be linked twice under two spellings: the
 * lowercase address for EVM, the public key for sr25519 (one key has an SS58 form per network
 * prefix). Null if the account is not a valid address of its scheme.
 */
export function accountKey(scheme: Scheme, account: string): string | null {
  try {
    asAccount(account, "account", scheme);
    return scheme === "eip712"
      ? evmAccountKey(getAddress(account))
      : u8aToHex(decodeAddress(account));
  } catch {
    return null;
  }
}

type Signed =
  | { kind: "link"; payload: LinkPayload }
  | { kind: "attestation"; payload: AttestationPayload };

/**
 * Whether `signature` (`0x` optional, either case) is the payload's account signing it: EIP-712
 * typed data recovered to the account, or sr25519 over the prefixed JCS message (plain or
 * `<Bytes>`-wrapped, as extensions send it).
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
    // @polkadot also accepts ed25519 and ecdsa signatures; the scheme is sr25519 and nothing else.
    const result = signatureVerify(message, sig, signed.payload.account);
    return result.isValid && result.crypto === "sr25519";
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
