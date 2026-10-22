/** Wallet signatures as real wallets make them: EIP-712 (ethers) and sr25519 (@polkadot). */
import { Keyring } from "@polkadot/keyring";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import {
  type AttestationPayload,
  attestationTypedData,
  ethersTypedData,
  type LinkPayload,
  linkTypedData,
  sr25519Message,
} from "@orbinum-ceremony/core";
import type { BaseWallet } from "ethers";

/** An EIP-712 link signature. */
export const signLinkEvm = (wallet: BaseWallet, payload: LinkPayload) =>
  wallet.signTypedData(...ethersTypedData(linkTypedData(payload)));

/** An EIP-712 attestation signature. */
export const signAttestationEvm = (wallet: BaseWallet, payload: AttestationPayload) =>
  wallet.signTypedData(...ethersTypedData(attestationTypedData(payload)));

/** A fresh keyring pair of `type` (sr25519 by default). */
export async function polkadotPair(type: "sr25519" | "ed25519" = "sr25519") {
  await cryptoWaitReady();
  return new Keyring({ type }).addFromUri(`//test-${type}-${Math.random()}`);
}

/** An sr25519 (or ed25519) signature over the prefixed JCS message, maybe `<Bytes>`-wrapped. */
export function signPolkadot(
  pair: Awaited<ReturnType<typeof polkadotPair>>,
  kind: "link" | "attestation",
  payload: LinkPayload | AttestationPayload,
  wrapped = false,
): string {
  const message =
    kind === "link"
      ? sr25519Message("link", payload as LinkPayload)
      : sr25519Message("attestation", payload as AttestationPayload);
  const bytes = wrapped ? new TextEncoder().encode(`<Bytes>${message}</Bytes>`) : message;
  return u8aToHex(pair.sign(bytes));
}
