/**
 * Public reads served from the edge cache for `PUBLIC_CACHE_SECONDS` (KL-36), so readers never
 * queue behind the ceremony's single object. The cache key is the origin and path only: a query
 * string never makes a miss. Only a successful answer, or a not-found (an unknown receipt), is
 * cached.
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

/**
 * The one cache entry of a public read, whatever query it was asked with and however its path is
 * percent-encoded (the router matches the decoded path, so every spelling must share the entry).
 */
const cacheKey = (url: string) => {
  const { origin, pathname } = new URL(url);
  let path = pathname;
  try {
    path = pathname
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/");
  } catch {
    // Not decodable: the router refuses it too, and it is never cached (not a 200 or 404).
  }
  return new Request(`${origin}${path}`);
};

/** Serves a public read from the edge cache, or caches its successful answer. */
export const edgeCache = createMiddleware<AppEnv>(async (c, next) => {
  const seconds = Number(c.env.PUBLIC_CACHE_SECONDS);
  if (!(seconds > 0)) return next();
  const cache = caches.default;
  const key = cacheKey(c.req.url);
  const hit = await cache.match(key);
  // A cached answer's headers are immutable: copy it, so later middleware can add its own.
  if (hit) return new Response(hit.body, hit);
  await next();
  if (c.res.status === 200 || c.res.status === 404) {
    c.res.headers.set("cache-control", `public, max-age=0, s-maxage=${seconds}`);
    c.executionCtx.waitUntil(cache.put(key, c.res.clone()));
  }
});
