/**
 * A host this machine or its network answers for, judged by its spelling alone (no DNS): the name
 * `localhost` (and its subdomains), or an internal IP literal (IPv4-mapped IPv6 included).
 */
import { isIP } from "node:net";
import { isInternalAddress } from "./is-internal-address";

export function isInternalHost(hostname: string): boolean {
  if (/^(?:.+\.)?localhost\.?$/.test(hostname)) return true;
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  return isIP(host) !== 0 && isInternalAddress(host);
}
