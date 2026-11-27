/**
 * Refuses a caller over a Workers rate-limiting binding's limit, keyed by the caller's GitHub id
 * (after `identity`) unless another key is given; no key at all is refused. The limits count per
 * location: an availability guard, not a cryptographic guarantee.
 */
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../env";
import { fail } from "../../http";

type Limiter = { [K in keyof Env]-?: Env[K] extends RateLimit ? K : never }[keyof Env];

const byIdentity = (c: Context<AppEnv>) => String(c.get("githubId"));

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
