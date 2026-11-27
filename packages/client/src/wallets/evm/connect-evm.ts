/**
 * An EVM account of the wallet the user picked, signing `eth_signTypedData_v4` over core's typed
 * data through that wallet's own provider, never whichever owns `window.ethereum`. The typed data
 * goes as a JSON string and the address checksummed, the forms every wallet accepts. A wallet that
 * answers 4100 without a prompt (locked, or it dropped this site's permission) gets one
 * `eth_requestAccounts`, which opens its unlock, then one retry.
 */
import { attestationTypedData, linkTypedData } from "@orbinum-ceremony/core";
import { UNAUTHORIZED } from "../constants";
import { codeOf, rethrowWalletError } from "../errors";
import type { Eip1193, Wallet, WalletOption } from "../types";
import { providerOf } from "./provider-of";
import { toChecksumAddress } from "./to-checksum-address";

async function signTyped(provider: Eip1193, account: string, typed: unknown): Promise<string> {
  const sign = () =>
    provider.request({
      method: "eth_signTypedData_v4",
      params: [toChecksumAddress(account), JSON.stringify(typed)],
    }) as Promise<string>;
  return sign()
    .catch(async (error: unknown) => {
      if (codeOf(error) !== UNAUTHORIZED) throw error;
      await provider.request({ method: "eth_requestAccounts" });
      return sign();
    })
    .catch(rethrowWalletError);
}

export async function connectEvm(option: WalletOption): Promise<Wallet> {
  const provider = providerOf(option.id);
  const accounts = (await provider
    .request({ method: "eth_requestAccounts" })
    .catch(rethrowWalletError)) as string[];
  const account = accounts?.[0]?.toLowerCase();
  if (!account) throw new Error(`${option.name} shared no account`);
  return {
    scheme: "eip712",
    account,
    walletId: option.id,
    name: option.name,
    signLink: (payload) => signTyped(provider, account, linkTypedData(payload)),
    signAttestation: (payload) => signTyped(provider, account, attestationTypedData(payload)),
  };
}
