/** The id a Solana wallet is picked by: `solana:<name>`, in lower case with spaces as dashes. */
import type { StandardWallet } from "../types";

export const solanaWalletId = (w: StandardWallet) =>
  `solana:${w.name.toLowerCase().replace(/\s+/g, "-")}`;
