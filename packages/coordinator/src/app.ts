/**
 * The Worker (COORDINATOR §3): its configuration checked first, security headers on every
 * answer, the routes, and the error answers.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./env";
import { fail, onError } from "./http";
import { configured } from "./middleware";
import { routes } from "./routes";

/** The Worker: every route group, behind the security headers and the configuration check. */
export const app = new Hono<AppEnv>()
  .use(secureHeaders())
  .use(configured)
  .route("/", routes)
  .notFound((c) => fail(c, "not-found", "no such route"))
  .onError(onError);
