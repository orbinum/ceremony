/**
 * The Worker's Hono app: the deployment's configuration checked first, security headers on every
 * answer, every route group, and coded error answers for unknown routes and unexpected errors.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./env";
import { fail, onError } from "./http";
import { configured } from "./middleware";
import { routes } from "./routes";

export const app = new Hono<AppEnv>()
  .use(secureHeaders())
  .use(configured)
  .route("/", routes)
  .notFound((c) => fail(c, "not-found", "no such route"))
  .onError(onError);
