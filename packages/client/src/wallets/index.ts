// client/wallets: the wallets this browser offers — EVM by EIP-6963, Solana by the Wallet
// Standard, Substrate extensions by injectedWeb3 — the one the user picks, and its signatures for
// the link and the attestation.
export { toChecksumAddress } from "./checksum";
export { detectWallets } from "./detect";
export { type Eip1193, INJECTED, listEvmWallets, providerOf, resetAnnouncements } from "./eip6963";
export { ChooseWallet, rethrowWalletError, WalletError } from "./errors";
export { connectEvm } from "./evm";
export { assertLinked, reconnect } from "./reconnect";
export { rememberedWallet, rememberWallet } from "./remember";
export { listSolanaWallets, resetSolanaWallets, solanaAccounts } from "./solana";
export { listSubstrateWallets, schemeOfAccount, substrateAccounts } from "./substrate";
export {
  type Family,
  familiesOf,
  type Wallet,
  type WalletAccount,
  type WalletOption,
} from "./types";
