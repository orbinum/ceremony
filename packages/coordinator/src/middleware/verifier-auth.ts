/**
 * Only the verifier (COORDINATOR §5): HMAC over the exact request and this ceremony's id
 * (`core/coordination/protocol`): the headers' shape and freshness before the body is read
 * (`verifierHeaders`), then the bounded body and the MAC (`verifierAuth`).
 */
import {
  authHeadersWellFormed,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  timestampFresh,
  verifyRequest,
} from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../http";

/**
 * First guard of `/internal/*`, ahead of any body read: the auth headers' shape and freshness. A
 * query string is outside the MAC, so none is taken. Freshness bounds replay; it is no credential.
 */
export const verifierHeaders = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.url.includes("?")) return fail(c, "unauthenticated", "bad signature");
  const timestamp = c.req.header(TIMESTAMP_HEADER);
  const signature = c.req.header(SIGNATURE_HEADER);
  if (!authHeadersWellFormed(timestamp, signature)) {
    return fail(c, "unauthenticated", "bad signature");
  }
  if (!timestampFresh(timestamp as string, Date.now())) {
    return fail(c, "unauthenticated", "bad signature");
  }
  return next();
});

/** Second guard, once the body is bounded: the HMAC over the exact request. */
export const verifierAuth = createMiddleware<AppEnv>(async (c, next) => {
  const body = c.req.method === "GET" ? "" : await c.req.text();
  const ok = verifyRequest(
    c.env.VERIFIER_HMAC_KEY,
    c.env.CEREMONY_ID,
    c.req.method,
    new URL(c.req.url).pathname,
    body,
    { timestamp: c.req.header(TIMESTAMP_HEADER), signature: c.req.header(SIGNATURE_HEADER) },
    Date.now(),
  );
  if (!ok) return fail(c, "unauthenticated", "bad signature");
  return next();
});
