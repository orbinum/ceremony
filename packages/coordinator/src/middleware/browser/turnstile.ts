/**
 * The Turnstile bot check on joining: a token in `X-Turnstile-Token`, solved on this host by the
 * page's join widget (action `join`). It slows scripted joins; it is not a sybil defence. A local
 * run has no widget.
 */
import { createMiddleware } from "hono/factory";
import { type AppEnv, isLocal } from "../../env";
import { fail } from "../../http";
import { verifyTurnstile } from "../../services";

export const turnstile = createMiddleware<AppEnv>(async (c, next) => {
  if (isLocal(c.env, c.req.url)) return next();
  const ok = await verifyTurnstile({
    secret: c.env.TURNSTILE_SECRET,
    token: c.req.header("x-turnstile-token"),
    ip: c.req.header("cf-connecting-ip"),
    hostname: new URL(c.req.url).hostname,
    action: "join",
  });
  return ok ? next() : fail(c, "turnstile", "bot check failed");
});
