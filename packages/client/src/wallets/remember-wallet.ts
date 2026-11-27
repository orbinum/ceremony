/**
 * Keeps in this browser the wallet the account was linked with, so the attestation is signed by
 * the same one. A convenience only: when storage is unavailable (private mode, blocked) nothing is
 * kept and the user picks it again.
 */
import type { Scheme } from "@orbinum-ceremony/core";
import { REMEMBERED_WALLET_KEY } from "./constants";

export function rememberWallet(scheme: Scheme, walletId: string): void {
  try {
    localStorage.setItem(REMEMBERED_WALLET_KEY, JSON.stringify({ scheme, walletId }));
  } catch {}
}
