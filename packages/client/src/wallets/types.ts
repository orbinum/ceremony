/**
 * A connected wallet, the wallets this browser offers to connect, and the provider interfaces this
 * client reads them through. A `Wallet` remembers the wallet it came from, so the attestation is
 * signed by the same one. A `WalletOption.id` is the EIP-6963 rdns (or `injected`) for an EVM
 * wallet, the `injectedWeb3` key for an extension, `solana:<name>` for a Wallet Standard wallet;
 * its icon is a `data:` URI the wallet announced, or one of ours, never a remote URL. A
 * `WalletAccount` names the Orbinum (SS58) account as the transcript does, and the wallet's own
 * spelling of the same key when it differs (a Solana base58 address).
 */
import type { AttestationPayload, LinkPayload, Scheme } from "@orbinum-ceremony/core";

export type Family = "substrate" | "solana" | "evm";

export interface Wallet {
  scheme: Scheme;
  account: string;
  walletId: string;
  name: string;
  signLink(payload: LinkPayload): Promise<string>;
  signAttestation(payload: AttestationPayload): Promise<string>;
}

export interface WalletOption {
  id: string;
  name: string;
  family: Family;
  icon?: string;
}

export interface WalletAccount {
  walletId: string;
  walletName: string;
  scheme: Scheme;
  address: string;
  native?: string;
  name: string | undefined;
  connect(): Wallet;
}

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface StandardAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly label?: string;
}

export interface StandardWallet {
  readonly name: string;
  readonly icon: string;
  readonly features: Readonly<Record<string, unknown>>;
}

export interface ConnectFeature {
  connect(): Promise<{ accounts: readonly StandardAccount[] }>;
}

export interface SignMessageFeature {
  signMessage(
    ...inputs: { account: StandardAccount; message: Uint8Array }[]
  ): Promise<readonly { signature: Uint8Array }[]>;
}

export interface InjectedAccount {
  address: string;
  name?: string;
  type?: string;
}

export interface Injected {
  accounts: { get(): Promise<InjectedAccount[]> };
  signer: {
    signRaw?(raw: { address: string; data: string; type: "bytes" }): Promise<{ signature: string }>;
  };
}

export type Extensions = Record<string, { enable(dapp: string): Promise<Injected> }>;
