/**
 * Keeps a route to the browser under a router that takes CLI tokens: joining (Turnstile) and
 * attesting (the wallet) need it.
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../env";
import { fail } from "../../http";

export const browserOnly = createMiddleware<AppEnv>(async (c, next) =>
  c.get("via") === "cli" ? fail(c, "forbidden", "not with a CLI token: use the browser") : next(),
);
