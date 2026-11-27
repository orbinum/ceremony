/** A linked account as the page shows it: scheme, SS58 and, for ed25519, its Solana form. */
import { shortAccount } from "./short-account";
import { solanaFormOf } from "./solana-form-of";

export function accountLine(scheme: string, account: string): string {
  const solana = solanaFormOf(scheme, account);
  return `${scheme} · ${shortAccount(account)}${solana ? ` · Solana ${shortAccount(solana)}` : ""}`;
}
