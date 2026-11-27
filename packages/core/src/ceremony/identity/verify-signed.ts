/**
 * Whether a link or attestation signature (`0x` optional, either case) is the payload's account
 * signing the exact bytes this folder defines, so the Worker, the CLI and the browser agree on
 * every record: EIP-712 typed data recovered to the account with ethers; sr25519 over the prefixed
 * JCS message with @polkadot, counting only the curve the scheme names (@polkadot accepts every
 * curve it knows); ed25519 by RFC 8032 with canonical encodings and a prime-order key and R. The
 * SS58 message may be signed bare (Solana wallets) or `<Bytes>`-wrapped (extensions).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { u8aWrapBytes } from "@polkadot/util";
import { signatureVerify } from "@polkadot/util-crypto";
import { getAddress, verifyTypedData } from "ethers";
import { fromHex, hex0x, normalizeSignature, utf8 } from "../../primitives/encoding";
import { attestationTypedData } from "./attestation-typed-data";
import { ethersTypedData } from "./ethers-typed-data";
import { linkTypedData } from "./link-typed-data";
import { primeOrderPoint } from "./prime-order-point";
import { sr25519Message } from "./sr25519-message";
import type { AttestationPayload, LinkPayload, Scheme } from "./types";
import { walletPublicKey } from "./wallet-public-key";

function verifyEd25519(text: string, signature: string, account: string): boolean {
  const key = walletPublicKey("ed25519", account);
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

export function verifySigned(scheme: Scheme, signed: Signed, signature: string): boolean {
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
    walletPublicKey(scheme, signed.payload.account);
    const result = signatureVerify(message, sig, signed.payload.account);
    return result.isValid && result.crypto === scheme;
  } catch {
    return false;
  }
}
