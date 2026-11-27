/**
 * The accounts of the Substrate extension the user picked that the coordinator can take: sr25519
 * ones, and ed25519 ones (a Ledger), signing core's message text with `signRaw`, which the
 * extensions wrap as `<Bytes>…</Bytes>`. Only the picked extension is asked for access: enabling
 * every one would open a prompt in each. An unanswered prompt times out.
 */
import { type Scheme, sr25519Message, toHex, utf8 } from "@orbinum-ceremony/core";
import { DAPP, ENABLE_TIMEOUT_MS } from "../constants";
import { rethrowWalletError } from "../errors";
import type { Injected, InjectedAccount, Wallet, WalletAccount, WalletOption } from "../types";
import { injectedExtensions } from "./injected-extensions";
import { schemeOfAccount } from "./scheme-of-account";

export async function substrateAccounts(option: WalletOption): Promise<WalletAccount[]> {
  const extension = injectedExtensions()[option.id];
  if (!extension) throw new Error(`${option.name} is no longer available in this browser.`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${option.name} did not answer: approve the request and retry.`)),
      ENABLE_TIMEOUT_MS,
    );
  });
  try {
    const injected = await Promise.race([extension.enable(DAPP), timeout]).catch(
      rethrowWalletError,
    );
    return (await injected.accounts.get()).flatMap((a) => {
      const scheme = schemeOfAccount(a);
      return scheme ? [accountOf(option, injected, a, scheme)] : [];
    });
  } finally {
    clearTimeout(timer);
  }
}

function accountOf(
  option: WalletOption,
  injected: Injected,
  a: InjectedAccount,
  scheme: Scheme,
): WalletAccount {
  const sign = async (text: string) => {
    const signRaw = injected.signer.signRaw;
    if (!signRaw) throw new Error(`${option.name} cannot sign raw messages`);
    const { signature } = await signRaw({
      address: a.address,
      data: `0x${toHex(utf8(text))}`,
      type: "bytes",
    }).catch(rethrowWalletError);
    return signature;
  };
  const connect = (): Wallet => ({
    scheme,
    account: a.address,
    walletId: option.id,
    name: option.name,
    signLink: (payload) => sign(sr25519Message("link", payload)),
    signAttestation: (payload) => sign(sr25519Message("attestation", payload)),
  });
  return {
    walletId: option.id,
    walletName: option.name,
    scheme,
    address: a.address,
    name: a.name,
    connect,
  };
}
