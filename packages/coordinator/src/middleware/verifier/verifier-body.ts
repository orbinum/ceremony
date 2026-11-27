/**
 * Second guard of `/internal/*`, once the body is bounded: its bytes are the ones whose digest the
 * verified MAC named.
 */
import { bodyMatches } from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../env";
import { fail } from "../../http";
import { authHeadersOf } from "./auth-headers-of";

export const verifierBody = createMiddleware<AppEnv>(async (c, next) => {
  const body = new Uint8Array(await c.req.arrayBuffer());
  return bodyMatches(body, authHeadersOf(c)) ? next() : fail(c, "unauthenticated", "bad signature");
});
