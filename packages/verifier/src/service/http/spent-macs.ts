/**
 * The MACs of dispatches already taken, until their freshness window closes: an authentic dispatch
 * is taken once. Only authenticated requests are kept, so only the key holder can grow it.
 */
import { REQUEST_AUTH } from "@orbinum-ceremony/core";

export function spentMacs() {
  const spent = new Map<string, number>();
  return (signature: string, timestamp: number, now: number): boolean => {
    for (const [mac, until] of spent) if (until <= now) spent.delete(mac);
    if (spent.has(signature)) return false;
    spent.set(signature, timestamp + REQUEST_AUTH.skewMs + 1);
    return true;
  };
}
