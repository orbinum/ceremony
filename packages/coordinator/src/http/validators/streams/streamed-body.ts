/** A streamed request body of exactly its declared `Content-Length`, within `max`. */
import type { Context } from "hono";
import { Malformed } from "../malformed";
import { contentLength } from "./content-length";

export function streamedBody(c: Context, max: number) {
  const size = contentLength(c, max);
  const body = c.req.raw.body;
  if (size === null || !body) throw new Malformed("a body with Content-Length is required");
  return { size, body };
}
