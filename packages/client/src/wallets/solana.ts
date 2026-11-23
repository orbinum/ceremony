/**
 * Solana wallets (Phantom, Solflare, Backpack…) as ed25519 accounts: the wallet's public key read
 * as an Orbinum SS58 account, signing core's message text bare with `solana:signMessage` (SPEC
 * §3.7). Found through the Wallet Standard handshake (`@wallet-standard/app`'s two events, written
 * out here instead of adding the dependency).
 */
import { sr25519Message, ss58Address, toHex, utf8 } from "@orbinum-ceremony/core";
import { rethrowWalletError } from "./errors";
import type { Wallet, WalletAccount, WalletOption } from "./types";

interface StandardAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly label?: string;
}

interface StandardWallet {
  readonly name: string;
  readonly icon: string;
  readonly features: Readonly<Record<string, unknown>>;
}

interface ConnectFeature {
  connect(): Promise<{ accounts: readonly StandardAccount[] }>;
}

interface SignMessageFeature {
  signMessage(
    ...inputs: { account: StandardAccount; message: Uint8Array }[]
  ): Promise<readonly { signature: Uint8Array }[]>;
}

const CONNECT = "standard:connect";
const SIGN_MESSAGE = "solana:signMessage";

const wallets = new Set<StandardWallet>();
let listening = false;

function register(...added: StandardWallet[]): () => void {
  for (const w of added) if (CONNECT in w.features && SIGN_MESSAGE in w.features) wallets.add(w);
  return () => added.forEach((w) => wallets.delete(w));
}

/** Wallets loaded before this answer `app-ready`; wallets loaded after announce themselves. */
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const api = Object.freeze({ register });
  window.addEventListener("wallet-standard:register-wallet", (event) =>
    (event as CustomEvent<(a: typeof api) => void>).detail?.(api),
  );
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
}

const idOf = (w: StandardWallet) => `solana:${w.name.toLowerCase().replace(/\s+/g, "-")}`;

/** Every Solana wallet registered so far. */
export function listSolanaWallets(): WalletOption[] {
  listen();
  return [...wallets].map((w) => ({
    id: idOf(w),
    name: w.name,
    family: "solana",
    icon: typeof w.icon === "string" && w.icon !== "" ? w.icon : undefined,
  }));
}

/** Asks the picked wallet for its accounts, as ed25519 SS58 accounts. */
export async function solanaAccounts(option: WalletOption): Promise<WalletAccount[]> {
  listen();
  const wallet = [...wallets].find((w) => idOf(w) === option.id);
  if (!wallet) throw new Error(`${option.name} is no longer available in this browser.`);
  const { accounts } = await (wallet.features[CONNECT] as ConnectFeature)
    .connect()
    .catch(rethrowWalletError);
  const signMessage = wallet.features[SIGN_MESSAGE] as SignMessageFeature;
  return accounts
    .filter((a) => a.publicKey.length === 32)
    .map((a) => {
      const address = ss58Address(a.publicKey);
      const sign = async (text: string) => {
        const [signed] = await signMessage
          .signMessage({ account: a, message: utf8(text) })
          .catch(rethrowWalletError);
        if (!signed) throw new Error(`${option.name} returned no signature`);
        return `0x${toHex(signed.signature)}`;
      };
      const connect = (): Wallet => ({
        scheme: "ed25519",
        account: address,
        walletId: option.id,
        name: option.name,
        signLink: (payload) => sign(sr25519Message("link", payload)),
        signAttestation: (payload) => sign(sr25519Message("attestation", payload)),
      });
      return {
        walletId: option.id,
        walletName: option.name,
        scheme: "ed25519",
        address,
        name: a.label ?? a.address.slice(0, 8),
        connect,
      };
    });
}

/** Forgets every registered wallet (tests). */
export function resetSolanaWallets(): void {
  wallets.clear();
  listening = false;
}
