/**
 * Every EVM wallet detected so far, most reliable signal first: EIP-6963 announcements (each
 * wallet with its own provider, name and logo, as the Hub shows it); else a bare
 * `window.ethereum`, named by the flag wallets set on it without announcing (Rabby, older builds).
 */
import { INJECTED } from "../constants";
import type { WalletOption } from "../types";
import { announced, listenForEvmWallets } from "./evm-registry";
import { injectedEthereum } from "./injected-ethereum";

function flaggedName(p: Record<string, unknown>): string {
  if (p.isRabby) return "Rabby";
  if (p.isTrust || p.isTrustWallet) return "Trust Wallet";
  if (p.isCoinbaseWallet) return "Coinbase Wallet";
  if (p.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

export function listEvmWallets(): WalletOption[] {
  listenForEvmWallets();
  const options: WalletOption[] = [...announced.values()].map(({ info }) => ({
    id: info.rdns,
    name: info.name,
    family: "evm",
    icon: typeof info.icon === "string" && info.icon !== "" ? info.icon : undefined,
  }));
  const root = injectedEthereum();
  if (options.length === 0 && root) {
    options.push({ id: INJECTED, name: flaggedName(root), family: "evm" });
  }
  return options;
}
