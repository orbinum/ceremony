/**
 * Wallet constants. EIP-1193 codes: 4001 the user rejected the request, 4100 the account is not
 * authorized for this site (a locked wallet, or a dropped permission). `INJECTED` is the id of the
 * one EVM provider found without an announcement. The Wallet Standard features a Solana wallet
 * needs. Substrate extensions: the name this site gives itself when it asks for access, how long
 * the user has to answer that prompt, names for extension ids (`injectedWeb3` holds nothing but
 * `{ version, enable }`), and the ones listed first, in this order. The browser storage key of the
 * wallet the account was linked with.
 */
export const USER_REJECTED = 4001;
export const UNAUTHORIZED = 4100;

export const INJECTED = "injected";

export const STANDARD_CONNECT = "standard:connect";
export const SOLANA_SIGN_MESSAGE = "solana:signMessage";

export const DAPP = "Orbinum Trusted Setup";
export const ENABLE_TIMEOUT_MS = 60_000;
export const EXTENSION_NAMES: Record<string, string> = {
  talisman: "Talisman",
  "subwallet-js": "SubWallet",
  "polkadot-js": "Polkadot{.js}",
  "fearless-wallet": "Fearless Wallet",
};
export const EXTENSION_PRIORITY = ["talisman", "subwallet-js"];

export const REMEMBERED_WALLET_KEY = "orbinum-ceremony.wallet";
