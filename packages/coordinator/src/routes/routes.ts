/**
 * Every route group, mounted where it is served. Routes only route (paths, middleware order,
 * validators, one-line handlers); what an endpoint does lives in `actions`. Each group mounted here
 * must be listed in `wrangler.jsonc`'s `run_worker_first`, or the static client would answer it.
 */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { sameOrigin } from "../middleware";
import { admin } from "./admin";
import { api } from "./api";
import { archive } from "./archive";
import { artifacts } from "./artifacts";
import { auth } from "./auth";
import { internal } from "./internal";

export const routes = new Hono<AppEnv>()
  .use("/auth/logout", sameOrigin)
  .route("/auth", auth)
  .route("/api", api)
  .route("/internal", internal)
  .route("/artifacts", artifacts)
  .route("/archive", archive)
  .route("/admin", admin);
