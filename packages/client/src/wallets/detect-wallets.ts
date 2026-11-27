/**
 * Every wallet this browser offers, by family. A multi-chain wallet (Talisman, SubWallet) also
 * announces itself as an EVM wallet: its Substrate row takes that announced icon, so one wallet
 * looks the same in both families.
 */
import { listEvmWallets } from "./evm";
import { listSolanaWallets } from "./solana";
import { listSubstrateWallets } from "./substrate";
import type { WalletOption } from "./types";

export function detectWallets(): WalletOption[] {
  const evm = listEvmWallets();
  const substrate = listSubstrateWallets();
  for (const s of substrate) s.icon = evm.find((e) => e.name === s.name)?.icon;
  return [...substrate, ...listSolanaWallets(), ...evm];
}
