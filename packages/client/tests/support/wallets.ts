/**
 * A browser's wallets, in Node: a `window` that EIP-6963 wallets announce to, injected extensions,
 * `localStorage`, and providers that record every request.
 */
import { vi } from "vitest";
import { type Eip1193, resetAnnouncements, resetSolanaWallets } from "../../src/wallets";

/** A provider answering `eth_requestAccounts` with `account` and signing with `signature`. */
export function fakeProvider(account: string, flags: Record<string, unknown> = {}) {
  const calls: { method: string; params?: unknown[] }[] = [];
  const failures: unknown[] = [];
  const provider: Eip1193 & Record<string, unknown> = {
    ...flags,
    request: async (args) => {
      calls.push(args);
      const failure = failures.shift();
      if (failure && args.method === "eth_signTypedData_v4") throw failure;
      return args.method === "eth_requestAccounts" ? [account] : `0xsig-${account}`;
    },
  };
  return { provider, calls, failures };
}

/** A fresh `window` (and `localStorage`) per test; `announce` makes a wallet announce itself. */
export function fakeBrowser() {
  resetAnnouncements();
  resetSolanaWallets();
  const window = Object.assign(new EventTarget(), {} as Record<string, unknown>);
  const store = new Map<string, string>();
  vi.stubGlobal("window", window);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  const announce = (rdns: string, name: string, provider: Eip1193, icon?: string) => {
    const detail = { info: { rdns, name, icon }, provider };
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    // A wallet answers every later request to announce, as real ones do.
    window.addEventListener("eip6963:requestProvider", () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })),
    );
  };
  return { window, announce };
}

/** A key pair as a Solana wallet holds it: its public key and how it signs bytes. */
interface SolanaKey {
  publicKey: Uint8Array;
  sign(message: Uint8Array): Uint8Array;
}

/** Registers a Wallet Standard wallet with one account of `key` (as Phantom does). */
export function fakeSolanaWallet(window: EventTarget, name: string, key: SolanaKey, icon = "") {
  const account = { address: `${name}-base58`, publicKey: key.publicKey, label: `${name} 1` };
  const wallet = {
    name,
    icon,
    features: {
      "standard:connect": { connect: async () => ({ accounts: [account] }) },
      "solana:signMessage": {
        signMessage: async (...inputs: { message: Uint8Array }[]) =>
          inputs.map((i) => ({ signature: key.sign(i.message) })),
      },
    },
  };
  const register = (event: Event) =>
    (event as CustomEvent<{ register(w: typeof wallet): void }>).detail.register(wallet);
  // A wallet loaded first answers the app's `app-ready`; one loaded later announces itself.
  window.addEventListener("wallet-standard:app-ready", register);
  window.dispatchEvent(
    new CustomEvent("wallet-standard:register-wallet", {
      detail: (api: { register(w: typeof wallet): void }) => api.register(wallet),
    }),
  );
}
