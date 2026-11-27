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

export const signLinkEvm = (wallet: BaseWallet, payload: LinkPayload) =>
  wallet.signTypedData(...ethersTypedData(linkTypedData(payload)));

export const signAttestationEvm = (wallet: BaseWallet, payload: AttestationPayload) =>
  wallet.signTypedData(...ethersTypedData(attestationTypedData(payload)));

export async function polkadotPair(type: "sr25519" | "ed25519" = "sr25519") {
  await cryptoWaitReady();
  return new Keyring({ type }).addFromUri(`//test-${type}-${Math.random()}`);
}

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
