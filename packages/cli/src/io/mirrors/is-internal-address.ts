/**
 * Whether an IP is internal (private, loopback, link-local, carrier-grade NAT, unspecified or
 * NAT64): none of them is a public mirror. Anything that is not an IP counts as internal.
 */
import { BlockList, isIP } from "node:net";

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

export function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || INTERNAL.check(address, family === 4 ? "ipv4" : "ipv6");
}
