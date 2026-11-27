/**
 * The wallets this browser offers, read again a few times after mount: extensions inject and
 * announce asynchronously, some after the page has rendered; `recheck` reads them on demand (a
 * wallet installed meanwhile).
 */
import { useEffect, useState } from "react";
import { detectWallets, type WalletOption } from "../wallets";

const DELAYS_MS = [300, 800, 1500, 2500];

export function useDetectedWallets() {
  const [wallets, setWallets] = useState<WalletOption[]>(detectWallets);

  useEffect(() => {
    const timers = DELAYS_MS.map((ms) => setTimeout(() => setWallets(detectWallets()), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  return { wallets, recheck: () => setWallets(detectWallets()) };
}
