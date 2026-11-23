/**
 * The linked wallet again, to sign the attestation: the wallet it was linked with (the one picked
 * now, the one remembered, or the only one of its families), and in it the linked account itself,
 * or the coordinator would refuse the signature.
 */
import type { Scheme } from "@orbinum-ceremony/core";
import { detectWallets } from "./detect";
import { ChooseWallet } from "./errors";
import { connectEvm } from "./evm";
import { rememberedWallet } from "./remember";
import { solanaAccounts } from "./solana";
import { substrateAccounts } from "./substrate";
import { familiesOf, type Wallet, type WalletOption } from "./types";

/** Which detected wallet holds the linked account; throws `ChooseWallet` when it is unclear. */
function walletFor(scheme: Scheme, picked: string | undefined): WalletOption {
  const families = familiesOf(scheme);
  const options = detectWallets().filter((o) => families.includes(o.family));
  const id = picked ?? rememberedWallet(scheme);
  const option = id ? options.find((o) => o.id === id) : options.length === 1 ? options[0] : null;
  if (option) return option;
  if (options.length === 0) throw new Error("The wallet you linked is not available here.");
  throw new ChooseWallet("Pick the wallet you linked your account with.");
}

/** `wallet` if it is the linked account (EVM case aside), or what to select instead. */
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

/** Connects the wallet holding `linked`, or says what to select in it. */
export async function reconnect(
  linked: { scheme: Scheme; account: string },
  picked?: string,
): Promise<Wallet> {
  const option = walletFor(linked.scheme, picked);
  if (option.family === "evm") return assertLinked(await connectEvm(option), linked);
  const accounts =
    option.family === "solana" ? await solanaAccounts(option) : await substrateAccounts(option);
  // ponytail: the exact SS58 text shared when linking; decode to the public key (core's
  // accountKey, which pulls polkadot's crypto into the page) if a prefix change shows up.
  const account = accounts.find((a) => a.address === linked.account && a.scheme === linked.scheme);
  if (!account) {
    throw new Error(`${option.name} does not share the linked account ${linked.account}.`);
  }
  return account.connect();
}
