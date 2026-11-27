/** Every Solana wallet (Phantom, Solflare, Backpack…) registered so far, with its own logo. */
import type { WalletOption } from "../types";
import { listenForSolanaWallets, registered } from "./solana-registry";
import { solanaWalletId } from "./solana-wallet-id";

export function listSolanaWallets(): WalletOption[] {
  listenForSolanaWallets();
  return [...registered].map((w) => ({
    id: solanaWalletId(w),
    name: w.name,
    family: "solana",
    icon: typeof w.icon === "string" && w.icon !== "" ? w.icon : undefined,
  }));
}
