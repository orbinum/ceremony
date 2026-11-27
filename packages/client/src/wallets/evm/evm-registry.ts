/**
 * The EIP-6963 announcements this page has collected: listening starts on first use and asks the
 * wallets already present to announce again. The first provider per rdns stays: a later page
 * script announcing the same rdns does not take over a wallet the user already sees listed.
 * `resetAnnouncements` forgets them all (tests).
 */
import type { Eip1193 } from "../types";

interface Announcement {
  info: { rdns: string; name: string; icon?: string };
  provider: Eip1193;
}

export const announced = new Map<string, Announcement>();
let listening = false;

export function listenForEvmWallets(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent<Announcement>).detail;
    if (detail?.info?.rdns && detail.provider && !announced.has(detail.info.rdns)) {
      announced.set(detail.info.rdns, detail);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function resetAnnouncements(): void {
  announced.clear();
  listening = false;
}
