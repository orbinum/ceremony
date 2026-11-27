/**
 * A wallet's canonical key, so the same key cannot be linked twice under two spellings: the
 * lowercase address for EVM, the public key for an SS58 account (one key has an SS58 form per
 * network prefix). Null if the account is not a valid address of its scheme, or a key no single
 * secret can hold.
 */
import { u8aToHex } from "@polkadot/util";
import { getAddress } from "ethers";
import { asAccount } from "./as-account";
import { evmAccountKey } from "./evm-account-key";
import type { Scheme } from "./types";
import { walletPublicKey } from "./wallet-public-key";

export function accountKey(scheme: Scheme, account: string): string | null {
  try {
    asAccount(account, "account", scheme);
    return scheme === "eip712"
      ? evmAccountKey(getAddress(account))
      : u8aToHex(walletPublicKey(scheme, account));
  } catch {
    return null;
  }
}
