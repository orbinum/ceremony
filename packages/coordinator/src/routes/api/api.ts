/** The `/api` router: everything a contributor calls; state changes only from this origin. */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { sameOrigin } from "../../middleware";
import { cliToken, link } from "./identity";
import { archived, config, receipt, status, transcript } from "./reads";
import { queue, session, upload } from "./turn";

export const api = new Hono<AppEnv>()
  .use(sameOrigin)
  .route("/archive", archived)
  .route("/config", config)
  .route("/cli-token", cliToken)
  .route("/link", link)
  .route("/queue", queue)
  .route("/session/upload", upload)
  .route("/session", session)
  .route("/receipt", receipt)
  .route("/status", status)
  .route("/transcript", transcript);
