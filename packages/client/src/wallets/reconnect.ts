/**
 * The linked wallet again, to sign the attestation: the wallet it was linked with (the one picked
 * now, the one remembered, or the only one of its families; else `ChooseWallet`), and in it the
 * linked account itself, or the coordinator would refuse the signature. An extension or Solana
 * account is matched by the exact SS58 text shared when linking; decoding to the public key
 * (core's `accountKey`, which pulls polkadot's crypto into the page) waits until a prefix change
 * shows up.
 */
import type { Scheme } from "@orbinum-ceremony/core";
import { assertLinked } from "./assert-linked";
import { ChooseWallet } from "./errors";
import { connectEvm } from "./evm";
import { detectWallets } from "./detect-wallets";
import { familiesOf } from "./families-of";
import { rememberedWallet } from "./remembered-wallet";
import { solanaAccounts } from "./solana";
import { substrateAccounts } from "./substrate";
import type { Wallet, WalletOption } from "./types";

function walletFor(scheme: Scheme, picked: string | undefined): WalletOption {
  const families = familiesOf(scheme);
  const options = detectWallets().filter((o) => families.includes(o.family));
  const id = picked ?? rememberedWallet(scheme);
  const option = id ? options.find((o) => o.id === id) : options.length === 1 ? options[0] : null;
  if (option) return option;
  if (options.length === 0) throw new Error("The wallet you linked is not available here.");
  throw new ChooseWallet("Pick the wallet you linked your account with.");
}

export async function reconnect(
  linked: { scheme: Scheme; account: string },
  picked?: string,
): Promise<Wallet> {
  const option = walletFor(linked.scheme, picked);
  if (option.family === "evm") return assertLinked(await connectEvm(option), linked);
  const accounts =
    option.family === "solana" ? await solanaAccounts(option) : await substrateAccounts(option);
  const account = accounts.find((a) => a.address === linked.account && a.scheme === linked.scheme);
  if (!account) {
    throw new Error(`${option.name} does not share the linked account ${linked.account}.`);
  }
  return account.connect();
}
