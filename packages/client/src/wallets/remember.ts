/**
 * The wallet the account was linked with, kept in this browser so the attestation is signed by the
 * same one. A convenience only: when storage is unavailable the user picks it again.
 */
import type { Scheme } from "@orbinum-ceremony/core";

const KEY = "orbinum-ceremony.wallet";

export function rememberWallet(scheme: Scheme, walletId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ scheme, walletId }));
  } catch {
    // Private mode or blocked storage: nothing to keep.
  }
}

/** The wallet remembered for `scheme`, if any. */
export function rememberedWallet(scheme: Scheme): string | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      scheme?: unknown;
      walletId?: unknown;
    } | null;
    return stored?.scheme === scheme && typeof stored.walletId === "string"
      ? stored.walletId
      : undefined;
  } catch {
    return undefined;
  }
}
