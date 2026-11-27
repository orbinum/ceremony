/**
 * The Solana wallets registered through the Wallet Standard handshake (`@wallet-standard/app`'s two
 * events, written out here instead of adding the dependency): wallets loaded before this answer
 * `app-ready`, wallets loaded after announce themselves. Only wallets that can connect and sign
 * messages are kept. `resetSolanaWallets` forgets them all (tests).
 */
import { SOLANA_SIGN_MESSAGE, STANDARD_CONNECT } from "../constants";
import type { StandardWallet } from "../types";

export const registered = new Set<StandardWallet>();
let listening = false;

function register(...added: StandardWallet[]): () => void {
  for (const w of added) {
    if (STANDARD_CONNECT in w.features && SOLANA_SIGN_MESSAGE in w.features) registered.add(w);
  }
  return () => added.forEach((w) => registered.delete(w));
}

export function listenForSolanaWallets(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const api = Object.freeze({ register });
  window.addEventListener("wallet-standard:register-wallet", (event) =>
    (event as CustomEvent<(a: typeof api) => void>).detail?.(api),
  );
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
}

export function resetSolanaWallets(): void {
  registered.clear();
  listening = false;
}
