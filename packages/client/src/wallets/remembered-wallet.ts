/** The wallet remembered in this browser for `scheme`, if any (see `rememberWallet`). */
import type { Scheme } from "@orbinum-ceremony/core";
import { REMEMBERED_WALLET_KEY } from "./constants";

export function rememberedWallet(scheme: Scheme): string | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(REMEMBERED_WALLET_KEY) ?? "null") as {
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
