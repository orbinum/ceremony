/** Identified answers (one's link, place, results) are never stored by any cache. */
import { createMiddleware } from "hono/factory";

export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.set("cache-control", "no-store");
});
