/** The provider of the EVM wallet `id` picked; throws if it is gone. */
import { INJECTED } from "../constants";
import type { Eip1193 } from "../types";
import { announced, listenForEvmWallets } from "./evm-registry";
import { injectedEthereum } from "./injected-ethereum";

export function providerOf(id: string): Eip1193 {
  listenForEvmWallets();
  const provider = id === INJECTED ? injectedEthereum() : announced.get(id)?.provider;
  if (!provider) throw new Error("That wallet is no longer available in this browser.");
  return provider;
}
