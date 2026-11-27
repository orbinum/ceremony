/**
 * Serves a public read from the edge cache for `PUBLIC_CACHE_SECONDS`, so readers never queue
 * behind the ceremony's single object, or caches its answer: only a success, or a not-found (an
 * unknown receipt). The cache key is the origin and path only, so a query string never makes a
 * miss, and every percent-encoding of a path shares one entry because the router matches the
 * decoded path; a path that does not decode is refused by the router and never cached. Browsers
 * never keep it (`max-age=0`), on a hit too: the zone's Browser Cache TTL rewrites a hit's
 * `max-age` (to 4 h by default), which would freeze a polling page on a stale status. A cached
 * answer's headers are immutable, so a hit is copied before its headers are set.
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

const cacheKey = (url: string) => {
  const { origin, pathname } = new URL(url);
  let path = pathname;
  try {
    path = pathname
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/");
  } catch {}
  return new Request(`${origin}${path}`);
};

export const edgeCache = createMiddleware<AppEnv>(async (c, next) => {
  const seconds = Number(c.env.PUBLIC_CACHE_SECONDS);
  if (!(seconds > 0)) return next();
  const cacheControl = `public, max-age=0, s-maxage=${seconds}`;
  const cache = caches.default;
  const key = cacheKey(c.req.url);
  const hit = await cache.match(key);
  if (hit) {
    const copy = new Response(hit.body, hit);
    copy.headers.set("cache-control", cacheControl);
    return copy;
  }
  await next();
  if (c.res.status === 200 || c.res.status === 404) {
    c.res.headers.set("cache-control", cacheControl);
    c.executionCtx.waitUntil(cache.put(key, c.res.clone()));
  }
});
