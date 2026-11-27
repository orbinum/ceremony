/**
 * A DNS lookup for connecting that refuses a name resolving to any internal address. The check is
 * the connection's own resolution, so a name cannot answer one address to a check and another to
 * the connect.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isInternalAddress } from "./is-internal-address";

type Lookup = (
  hostname: string,
  options: object,
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => void;

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
