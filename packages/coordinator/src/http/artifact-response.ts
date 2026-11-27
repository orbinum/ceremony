/**
 * A public file (`key`, within its ceremony's folder) as inert bytes: never a page (`nosniff`, a
 * sandboxing CSP), with its stored type or octet-stream. Only the genesis keys, frozen before any
 * contribution and pinned by `init.json`, are cached for good; everything else is revalidated by
 * its ETag on every use: a contribution or log at an index the transcript does not record (a failed
 * promotion) is replaced later, `final/` may be corrected until FINALIZED, and `transcript.json`
 * and `status.json` change. The cache policy is set after the stored metadata, which never
 * overrides it. An object without a body is one whose ETag the reader already has: `304`.
 */
const IMMUTABLE = ["genesis/"];

export function artifactResponse(object: R2Object | R2ObjectBody, key: string): Response {
  const immutable = IMMUTABLE.some((prefix) => key.startsWith(prefix));
  const headers = new Headers({
    "content-length": String(object.size),
    etag: object.httpEtag,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  });
  object.writeHttpMetadata(headers);
  headers.set("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
  if (!("body" in object)) {
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}
