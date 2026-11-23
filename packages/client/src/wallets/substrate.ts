/**
 * Accounts of the Substrate extension the user picked (`window.injectedWeb3`: Talisman, SubWallet,
 * polkadot-js…), signing core's message text with `signRaw`, which the extensions wrap as
 * `<Bytes>…</Bytes>` (SPEC §3.7): sr25519 accounts, and ed25519 ones (a Ledger). Only the picked
 * extension is asked for access: enabling every one would open a prompt in each.
 */
import { type Scheme, sr25519Message, toHex, utf8 } from "@orbinum-ceremony/core";
import { rethrowWalletError } from "./errors";
import type { Wallet, WalletAccount, WalletOption } from "./types";

interface InjectedAccount {
  address: string;
  name?: string;
  type?: string;
}

interface Injected {
  accounts: { get(): Promise<InjectedAccount[]> };
  signer: {
    signRaw?(raw: { address: string; data: string; type: "bytes" }): Promise<{ signature: string }>;
  };
}

/** The name this site gives itself when it asks an extension for access. */
const DAPP = "Orbinum Trusted Setup";
/** How long the user has to answer the extension's access prompt. */
const ENABLE_TIMEOUT_MS = 60_000;

/**
 * Names for extension ids: `injectedWeb3` holds nothing but `{ version, enable }`. The logo comes
 * from the same wallet's EIP-6963 announcement (`detect.ts`), as in the Hub.
 */
const NAMES: Record<string, string> = {
  talisman: "Talisman",
  "subwallet-js": "SubWallet",
  "polkadot-js": "Polkadot{.js}",
  "fearless-wallet": "Fearless Wallet",
};

/** Listed first, in this order; the rest keep their detection order. */
const PRIORITY = ["talisman", "subwallet-js"];

type Extensions = Record<string, { enable(dapp: string): Promise<Injected> }>;

const extensions = (): Extensions =>
  (typeof window === "undefined"
    ? undefined
    : (window as { injectedWeb3?: Extensions }).injectedWeb3) ?? {};

const rank = (id: string) => (PRIORITY.includes(id) ? PRIORITY.indexOf(id) : PRIORITY.length);

/** Every extension detected so far. */
export const listSubstrateWallets = (): WalletOption[] =>
  Object.keys(extensions())
    .toSorted((a, b) => rank(a) - rank(b))
    .map((id) => ({
      id,
      name: NAMES[id] ?? id,
      family: "substrate",
    }));

/**
 * The scheme an extension account signs under, or null if the coordinator cannot take it:
 * multi-chain extensions list Ethereum (`0x…`, ecdsa) accounts here too. An account that declares
 * no type is the Substrate default, sr25519 (its signature is verified anyway).
 */
export function schemeOfAccount(a: InjectedAccount): Scheme | null {
  if (a.address.startsWith("0x")) return null;
  if (a.type === undefined || a.type === "sr25519") return "sr25519";
  return a.type === "ed25519" ? "ed25519" : null;
}

/** Asks the picked extension for access and lists the accounts the coordinator can take. */
export async function substrateAccounts(option: WalletOption): Promise<WalletAccount[]> {
  const extension = extensions()[option.id];
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
