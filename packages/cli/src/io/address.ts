/**
 * Which addresses are internal (private, loopback, link-local, CGNAT, unspecified, NAT64): a
 * public mirror is none of them, judged by an IP's spelling or by the connection's own DNS answer.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";

/**
 * Private, loopback, link-local, carrier-grade NAT, unspecified and NAT64 addresses: none of them
 * is a public mirror.
 */
const INTERNAL = new BlockList();
for (const [net, prefix] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
  ["0.0.0.0", 8],
] as const) {
  INTERNAL.addSubnet(net, prefix, "ipv4");
}
INTERNAL.addSubnet("fc00::", 7, "ipv6");
INTERNAL.addSubnet("fe80::", 10, "ipv6");
INTERNAL.addSubnet("64:ff9b::", 96, "ipv6");
INTERNAL.addSubnet("64:ff9b:1::", 48, "ipv6");
INTERNAL.addAddress("::1", "ipv6");
INTERNAL.addAddress("::", "ipv6");

/** Whether `address` (an IP) is internal; anything that is not an IP is. */
export function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || INTERNAL.check(address, family === 4 ? "ipv4" : "ipv6");
}

type Lookup = (
  hostname: string,
  options: object,
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => void;

/**
 * A DNS lookup for connecting that refuses a name resolving to any internal address: the check is
 * the connection's own resolution, so a name cannot answer one address to a check and another to
 * the connect.
 */
export const publicOnlyLookup =
  (resolve: Lookup = dnsLookup as unknown as Lookup): Lookup =>
  (hostname, options, callback) =>
    resolve(hostname, options, (error, address, family) => {
      if (error) return callback(error, address, family);
      const all = typeof address === "string" ? [address] : address.map((a) => a.address);
      const internal = all.find(isInternalAddress);
      if (internal !== undefined || all.length === 0) {
        return callback(new Error(`${hostname} resolves to an internal address`), address, family);
      }
      return callback(null, address, family);
    });

/**
 * A host this machine or its network answers for, judged by its spelling alone (no DNS): the
 * name `localhost` (and its subdomains), or an internal IP literal (IPv4-mapped IPv6 included).
 */
export function isInternalHost(hostname: string): boolean {
  if (/^(?:.+\.)?localhost\.?$/.test(hostname)) return true;
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  return isIP(host) !== 0 && isInternalAddress(host);
}
