/**
 * Response headers set in one place: no caching of identified answers, and inert public files.
 * COORDINATOR §3.
 */
import { createMiddleware } from "hono/factory";

/** Identified answers (one's link, place, results) are never stored by any cache. */
export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.set("cache-control", "no-store");
});

/**
 * Files written once and never changed, each pinned by a hash upstream: genesis, accepted
 * contributions and their logs. `transcript.json` and `status.json` change.
 */
// `final/` is not: a final file may be corrected until FINALIZED, so it is revalidated.
const IMMUTABLE = ["genesis/", "contributions/", "logs/"];

/**
 * A public file as inert bytes: never a page (`nosniff`, a sandboxing CSP), with its stored type
 * or octet-stream; cached for good when it never changes, revalidated on every use otherwise.
 */
export function artifactResponse(object: R2ObjectBody): Response {
  const immutable = IMMUTABLE.some((prefix) => object.key.startsWith(prefix));
  const headers = new Headers({
    "content-length": String(object.size),
    etag: object.httpEtag,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  });
  object.writeHttpMetadata(headers);
  // Set after the stored metadata, which never overrides it.
  headers.set("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
  return new Response(object.body, { headers });
}

/** A private upload streamed to the verifier, exactly its stored length. */
export const objectResponse = (object: R2ObjectBody): Response =>
  new Response(object.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
    },
  });
