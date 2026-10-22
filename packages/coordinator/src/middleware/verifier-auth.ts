/**
 * Only the verifier (COORDINATOR §5): HMAC over the exact request and this ceremony's id
 * (`core/coordination/protocol`). The headers are checked for shape before the body is read, and
 * the body is bounded first.
 */
import {
  authHeadersWellFormed,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequest,
} from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../http";

/** Guards `/internal/*`. A query string is outside the MAC, so none is taken. */
export const verifierAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.url.includes("?")) return fail(c, "unauthenticated", "bad signature");
  const timestamp = c.req.header(TIMESTAMP_HEADER);
  const signature = c.req.header(SIGNATURE_HEADER);
  if (!authHeadersWellFormed(timestamp, signature)) {
    return fail(c, "unauthenticated", "bad signature");
  }
  const body = c.req.method === "GET" ? "" : await c.req.text();
  const ok = verifyRequest(
    c.env.VERIFIER_HMAC_KEY,
    c.env.CEREMONY_ID,
    c.req.method,
    new URL(c.req.url).pathname,
    body,
    { timestamp, signature },
    Date.now(),
  );
  if (!ok) return fail(c, "unauthenticated", "bad signature");
  return next();
});
