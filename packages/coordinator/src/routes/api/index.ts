// coordinator/routes/api: everything a contributor calls, under `/api`; state changes only from
// this origin.
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { sameOrigin } from "../../middleware";
import { cliToken } from "./cli-token";
import { link } from "./link";
import { config, receipt, status, transcript } from "./public";
import { queue } from "./queue";
import { session } from "./session";
import { upload } from "./upload";

/** The `/api` router. */
export const api = new Hono<AppEnv>()
  .use(sameOrigin)
  .route("/config", config)
  .route("/cli-token", cliToken)
  .route("/link", link)
  .route("/queue", queue)
  .route("/session/upload", upload)
  .route("/session", session)
  .route("/receipt", receipt)
  .route("/status", status)
  .route("/transcript", transcript);
