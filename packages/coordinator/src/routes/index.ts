// coordinator/routes: routing only (paths, middleware order, validators, one-line handlers);
// what an endpoint does lives in `actions`.
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { sameOrigin } from "../middleware";
import { admin } from "./admin";
import { api } from "./api";
import { artifacts } from "./artifacts";
import { auth } from "./auth";
import { internal } from "./internal";

/** Every route group, mounted where it is served. */
export const routes = new Hono<AppEnv>()
  .use("/auth/logout", sameOrigin)
  .route("/auth", auth)
  .route("/api", api)
  .route("/internal", internal)
  .route("/artifacts", artifacts)
  .route("/admin", admin);
