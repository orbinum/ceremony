/**
 * The picked Solana wallet's accounts as ed25519 accounts: each public key read as an Orbinum SS58
 * account, signing core's message text bare with `solana:signMessage`.
 */
import { sr25519Message, ss58Address, toHex, utf8 } from "@orbinum-ceremony/core";
import { SOLANA_SIGN_MESSAGE, STANDARD_CONNECT } from "../constants";
import { rethrowWalletError } from "../errors";
import type {
  ConnectFeature,
  SignMessageFeature,
  Wallet,
  WalletAccount,
  WalletOption,
} from "../types";
import { listenForSolanaWallets, registered } from "./solana-registry";
import { solanaWalletId } from "./solana-wallet-id";

export async function solanaAccounts(option: WalletOption): Promise<WalletAccount[]> {
  listenForSolanaWallets();
  const wallet = [...registered].find((w) => solanaWalletId(w) === option.id);
  if (!wallet) throw new Error(`${option.name} is no longer available in this browser.`);
  const { accounts } = await (wallet.features[STANDARD_CONNECT] as ConnectFeature)
    .connect()
    .catch(rethrowWalletError);
  const signMessage = wallet.features[SOLANA_SIGN_MESSAGE] as SignMessageFeature;
  return accounts
    .filter((a) => a.publicKey.length === 32)
    .map((a) => {
      const address = ss58Address(a.publicKey);
      const sign = async (text: string) => {
        const [signed] = await signMessage
          .signMessage({ account: a, message: utf8(text) })
          .catch(rethrowWalletError);
        if (!signed) throw new Error(`${option.name} returned no signature`);
        return `0x${toHex(signed.signature)}`;
      };
      const connect = (): Wallet => ({
        scheme: "ed25519",
        account: address,
        walletId: option.id,
        name: option.name,
        signLink: (payload) => sign(sr25519Message("link", payload)),
        signAttestation: (payload) => sign(sr25519Message("attestation", payload)),
      });
      return {
        walletId: option.id,
        walletName: option.name,
        scheme: "ed25519",
        address,
        native: a.address,
        name: a.label ?? a.address.slice(0, 8),
        connect,
      };
    });
}
