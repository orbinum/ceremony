/**
 * client/wallets: the wallets this browser offers (EVM by EIP-6963, Solana by the Wallet Standard,
 * Substrate extensions by `injectedWeb3`), the one the user picks, and its signatures for the link
 * and the attestation.
 */
export { assertLinked } from "./assert-linked";
export { INJECTED } from "./constants";
export { detectWallets } from "./detect-wallets";
export { ChooseWallet, rethrowWalletError, WalletError } from "./errors";
export {
  connectEvm,
  listEvmWallets,
  providerOf,
  resetAnnouncements,
  toChecksumAddress,
} from "./evm";
export { familiesOf } from "./families-of";
export { reconnect } from "./reconnect";
export { rememberWallet } from "./remember-wallet";
export { rememberedWallet } from "./remembered-wallet";
export { listSolanaWallets, resetSolanaWallets, solanaAccounts } from "./solana";
export { listSubstrateWallets, schemeOfAccount, substrateAccounts } from "./substrate";
export {
  type Eip1193,
  type Family,
  type Wallet,
  type WalletAccount,
  type WalletOption,
} from "./types";
