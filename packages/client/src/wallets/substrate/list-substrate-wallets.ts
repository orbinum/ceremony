/**
 * Every Substrate extension detected so far (Talisman, SubWallet, polkadot-js…), the preferred ones
 * first and the rest in detection order. Nothing injected names a logo: it comes from the same
 * wallet's EIP-6963 announcement (`detectWallets`), as in the Hub.
 */
import { EXTENSION_NAMES, EXTENSION_PRIORITY } from "../constants";
import type { WalletOption } from "../types";
import { injectedExtensions } from "./injected-extensions";

const rank = (id: string) =>
  EXTENSION_PRIORITY.includes(id) ? EXTENSION_PRIORITY.indexOf(id) : EXTENSION_PRIORITY.length;

export const listSubstrateWallets = (): WalletOption[] =>
  Object.keys(injectedExtensions())
    .toSorted((a, b) => rank(a) - rank(b))
    .map((id) => ({
      id,
      name: EXTENSION_NAMES[id] ?? id,
      family: "substrate",
    }));
