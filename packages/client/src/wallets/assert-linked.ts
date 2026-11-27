/**
 * `wallet` if it is the linked account (an EVM address compared case-insensitively), or what to
 * select instead: the coordinator would refuse a signature by any other.
 */
import type { Scheme } from "@orbinum-ceremony/core";
import type { Wallet } from "./types";

export function assertLinked(wallet: Wallet, linked: { scheme: Scheme; account: string }): Wallet {
  const same =
    wallet.scheme === linked.scheme &&
    (linked.scheme === "eip712"
      ? wallet.account.toLowerCase() === linked.account.toLowerCase()
      : wallet.account === linked.account);
  if (!same) {
    throw new Error(`Select the linked account ${linked.account} in ${wallet.name} and retry.`);
  }
  return wallet;
}
