/**
 * Cross-site request forgery: a state-changing request a browser sends from another origin is
 * refused. Browsers always send `Origin` (and `Sec-Fetch-Site`) on such requests; tools that send
 * neither cannot ride a cookie. The session cookie's `SameSite=Lax` alone would still let a
 * sibling subdomain post.
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../http";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Refuses state changes from another origin or site. */
export const sameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE.has(c.req.method)) return next();
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  const own = new URL(c.req.url).origin;
  if (
    (origin !== undefined && origin !== own) ||
    (site !== undefined && site !== "same-origin" && site !== "none")
  ) {
    return fail(c, "forbidden", "cross-origin request");
  }
  return next();
});
