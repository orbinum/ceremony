/**
 * An ed25519 account as a Solana address (the same key, base58): how a Solana contributor finds
 * their own records, which the transcript names in SS58. Null for any other account, or one that
 * cannot be read.
 */
import { ss58PublicKey, toBase58 } from "@orbinum-ceremony/core";

export function solanaFormOf(scheme: string, account: string): string | null {
  if (scheme !== "ed25519") return null;
  try {
    return toBase58(ss58PublicKey(account));
  } catch {
    return null;
  }
}
