/** A connected wallet, and the wallets this browser offers to connect. */
import type { AttestationPayload, LinkPayload, Scheme } from "@orbinum-ceremony/core";

/** How a wallet reaches the page, as the picker groups them. */
export type Family = "substrate" | "solana" | "evm";

/** One account of one wallet, and what it signs for the ceremony (SPEC §3.4–3.7). */
export interface Wallet {
  scheme: Scheme;
  account: string;
  /** The wallet it came from (`WalletOption.id`), so the attestation is signed by the same one. */
  walletId: string;
  /** For the UI (`MetaMask`, `Talisman`, `Phantom`, …). */
  name: string;
  signLink(payload: LinkPayload): Promise<string>;
  signAttestation(payload: AttestationPayload): Promise<string>;
}

/** A wallet detected in this browser, as the user picks it. */
export interface WalletOption {
  /**
   * EIP-6963 rdns (or `injected`) for EVM wallets, the `injectedWeb3` key for extensions,
   * `solana:<name>` for Wallet Standard wallets.
   */
  id: string;
  name: string;
  family: Family;
  /** A `data:image/…` URI the wallet announced, or one of ours; never a remote URL. */
  icon?: string;
}

/** An account a wallet shares, ready to be connected as a `Wallet`. */
export interface WalletAccount {
  walletId: string;
  walletName: string;
  scheme: Scheme;
  /** The Orbinum (SS58) account, as the transcript names it. */
  address: string;
  /** The wallet's own spelling of the same key, when it differs (a Solana base58 address). */
  native?: string;
  name: string | undefined;
  connect(): Wallet;
}

/** The families whose accounts sign under `scheme`. */
export const familiesOf = (scheme: Scheme): Family[] =>
  scheme === "eip712" ? ["evm"] : scheme === "sr25519" ? ["substrate"] : ["solana", "substrate"];
