/**
 * Only the verifier (COORDINATOR §5): HMAC over the exact request and this ceremony's id
 * (`core/coordination/protocol`). The MAC covers the body's digest, so it is checked before any
 * body byte is read (`verifierHeaders`); the bounded body is then held to that digest
 * (`verifierBody`). An unauthenticated request costs one HMAC over its headers, nothing more.
 */
import { bodyMatches, requestAuthOf, verifyRequestHeaders } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { fail } from "../http";

const authHeadersOf = (c: Context<AppEnv>) => requestAuthOf((name) => c.req.header(name));

/**
 * First guard of `/internal/*`, ahead of any body read: the MAC over the headers, the method, the
 * path and the announced body digest. A query string is outside the MAC, so none is taken.
 */
export const verifierHeaders = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.url.includes("?")) return fail(c, "unauthenticated", "bad signature");
  const ok = verifyRequestHeaders(
    c.env.VERIFIER_HMAC_KEY,
    c.env.CEREMONY_ID,
    c.req.method,
    new URL(c.req.url).pathname,
    authHeadersOf(c),
    Date.now(),
  );
  return ok ? next() : fail(c, "unauthenticated", "bad signature");
});

/** Second guard, once the body is bounded: its bytes are the ones the MAC named. */
export const verifierBody = createMiddleware<AppEnv>(async (c, next) => {
  const body = new Uint8Array(await c.req.arrayBuffer());
  return bodyMatches(body, authHeadersOf(c)) ? next() : fail(c, "unauthenticated", "bad signature");
});
