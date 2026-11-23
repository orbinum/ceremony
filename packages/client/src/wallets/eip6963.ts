/**
 * EVM wallets in this browser, most reliable signal first: an EIP-6963 announcement (each wallet
 * with its own provider, name and icon), then the flags wallets set on `window.ethereum` without
 * announcing (Rabby, older builds), then a bare `window.ethereum`.
 */
import type { WalletOption } from "./types";

/** The part of an EIP-1193 provider this client uses. */
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Announcement {
  info: { rdns: string; name: string; icon?: string };
  provider: Eip1193;
}

/** The id of the one provider found without an announcement. */
export const INJECTED = "injected";

const announced = new Map<string, Announcement>();
let listening = false;

/** Starts collecting announcements and asks the wallets already present to announce again. */
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent<Announcement>).detail;
    // The first provider per rdns stays: a later page script announcing the same rdns does not
    // take over a wallet the user already sees listed.
    if (detail?.info?.rdns && detail.provider && !announced.has(detail.info.rdns)) {
      announced.set(detail.info.rdns, detail);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

const injected = (): (Eip1193 & Record<string, unknown>) | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as { ethereum?: Eip1193 & Record<string, unknown> }).ethereum;

/** A name for a provider that did not announce, from the flag it sets on itself. */
function flaggedName(p: Record<string, unknown>): string {
  if (p.isRabby) return "Rabby";
  if (p.isTrust || p.isTrustWallet) return "Trust Wallet";
  if (p.isCoinbaseWallet) return "Coinbase Wallet";
  if (p.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

/** Every EVM wallet detected so far. */
export function listEvmWallets(): WalletOption[] {
  listen();
  const options: WalletOption[] = [...announced.values()].map(({ info }) => ({
    id: info.rdns,
    name: info.name,
    family: "evm",
    // The wallet's own logo, as it announced it (as the Hub shows it).
    icon: typeof info.icon === "string" && info.icon !== "" ? info.icon : undefined,
  }));
  const root = injected();
  if (options.length === 0 && root) {
    options.push({ id: INJECTED, name: flaggedName(root), family: "evm" });
  }
  return options;
}

/** The provider of the wallet `id` picked; throws if it is gone. */
export function providerOf(id: string): Eip1193 {
  listen();
  const provider = id === INJECTED ? injected() : announced.get(id)?.provider;
  if (!provider) throw new Error("That wallet is no longer available in this browser.");
  return provider;
}

/** Forgets every announcement (tests). */
export function resetAnnouncements(): void {
  announced.clear();
  listening = false;
}
