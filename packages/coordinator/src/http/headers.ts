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
 * Files frozen before any contribution and pinned by `init.json`: the genesis keys. Everything else
 * is revalidated by its ETag: a contribution or log at an index the transcript does not record (a
 * failed promotion) is replaced later, so no reader may keep it; `final/` may be corrected until
 * FINALIZED; `transcript.json` and `status.json` change.
 */
const IMMUTABLE = ["genesis/"];

/**
 * A public file (`key`, within its ceremony's folder) as inert bytes: never a page (`nosniff`, a
 * sandboxing CSP), with its stored type or octet-stream; cached for good when it never changes,
 * revalidated on every use otherwise. An object without a body is one whose ETag the reader
 * already has: `304`.
 */
export function artifactResponse(object: R2Object | R2ObjectBody, key: string): Response {
  const immutable = IMMUTABLE.some((prefix) => key.startsWith(prefix));
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
  if (!("body" in object)) {
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }
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
