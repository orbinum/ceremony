/**
 * The caller's network (an IPv6 /64, an IPv4 address) as the rate-limit key of unauthenticated
 * routes. Cloudflare's edge sets `cf-connecting-ip` on every request it forwards; one without a
 * readable address did not come through it: a local run counts it as one client, anything else is
 * refused (null), so no request is ever outside a bucket and no shared bucket lets one client
 * starve the others.
 */
import type { Context } from "hono";
import { type AppEnv, isLocal } from "../../env";
import { networkOf } from "./network-of";

export function byNetwork(c: Context<AppEnv>): string | null {
  const address = c.req.header("cf-connecting-ip");
  const network = address ? networkOf(address) : null;
  if (network) return network;
  return isLocal(c.env, c.req.url) ? "loopback" : null;
}
