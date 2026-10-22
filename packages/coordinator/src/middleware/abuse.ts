/**
 * Availability guards: rate limits (Workers rate-limiting bindings, per location, KL-38) and the
 * Turnstile bot check on joining. Neither is a cryptographic guarantee. SPEC §4.1.
 */
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { type AppEnv, isLocal } from "../env";
import { fail } from "../http";
import { verifyTurnstile } from "../services";
import { networkOf } from "./network";

type Limiter = { [K in keyof Env]: Env[K] extends RateLimit ? K : never }[keyof Env];

/** The caller's GitHub id (after `identity`). */
const byIdentity = (c: Context<AppEnv>) => String(c.get("githubId"));

/**
 * The caller's network (an IPv6 /64, an IPv4 address), for unauthenticated routes. Cloudflare's
 * edge sets `cf-connecting-ip` on every request it forwards; one without a readable address did
 * not come through it: a local run counts it as one client, anything else is refused (null), so
 * no request is ever outside a bucket and no shared bucket lets one client starve the others.
 */
export function byNetwork(c: Context<AppEnv>): string | null {
  const address = c.req.header("cf-connecting-ip");
  const network = address ? networkOf(address) : null;
  if (network) return network;
  return isLocal(c.env, c.req.url) ? "loopback" : null;
}

/** Refuses a caller over `binding`'s limit, keyed by `keyOf` (no key: refused). */
export const rateLimit = (
  binding: Limiter,
  keyOf: (c: Context<AppEnv>) => string | null = byIdentity,
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const key = keyOf(c);
    if (key === null) return fail(c, "forbidden", "no client address");
    const { success } = await c.env[binding].limit({ key });
    return success ? next() : fail(c, "rate-limited", "too many requests");
  });

/** A Turnstile token in `X-Turnstile-Token`, solved on this host. A local run has no widget. */
export const turnstile = createMiddleware<AppEnv>(async (c, next) => {
  if (isLocal(c.env, c.req.url)) return next();
  const ok = await verifyTurnstile({
    secret: c.env.TURNSTILE_SECRET,
    token: c.req.header("x-turnstile-token"),
    ip: c.req.header("cf-connecting-ip"),
    hostname: new URL(c.req.url).hostname,
  });
  return ok ? next() : fail(c, "turnstile", "bot check failed");
});
