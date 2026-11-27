/**
 * First guard of `/internal/*`, the verifier's routes, ahead of any body read: an HMAC over the
 * headers, the method, the path, this ceremony's id and the announced body digest, so an
 * unauthenticated request costs one HMAC over its headers and nothing more. A query string is
 * outside the MAC, so none is taken.
 */
import { verifyRequestHeaders } from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../env";
import { fail } from "../../http";
import { authHeadersOf } from "./auth-headers-of";

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
