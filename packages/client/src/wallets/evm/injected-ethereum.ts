/** The provider on `window.ethereum`, if any, with the flags wallets set on it. */
import type { Eip1193 } from "../types";

export const injectedEthereum = (): (Eip1193 & Record<string, unknown>) | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as { ethereum?: Eip1193 & Record<string, unknown> }).ethereum;
