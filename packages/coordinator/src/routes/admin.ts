/**
 * `/admin`, behind `sameOrigin` and `operator`: the setup files and the frozen setup once, the
 * state actions and lifting an identity's hold, then the final files and the finalization. An
 * operator's browser carries the Access cookie, so a foreign page is refused outright, not only
 * through the preflight the marker header forces; the CLI sends neither header. Bodies are bounded:
 * the setup's two documents as JSON strings (escaping at most doubles them) plus sizes, a one-field
 * action, and a beacon with one final record per circuit (a few KB).
 */
import { MAX_DOCUMENT_BYTES } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { configureCeremony, publishFile } from "../actions";
import { ceremony } from "../durable";
import type { AppEnv } from "../env";
import {
  answer,
  finalizeBody,
  limitBody,
  operatorAction,
  publicFileInput,
  respond,
  setupInput,
  unholdBody,
} from "../http";
import { operator, sameOrigin } from "../middleware";

const MAX_SETUP_BYTES = 2 * 2 * MAX_DOCUMENT_BYTES + 64 * 1024;
const MAX_ACTION_BYTES = 1024;
const MAX_FINALIZE_BYTES = 64 * 1024;

export const admin = new Hono<AppEnv>()
  .use(sameOrigin, operator)
  .put("/artifacts/*", publicFileInput, async (c) =>
    answer(c, await publishFile(c.env, c.req.valid("header"))),
  )
  .post("/configure", limitBody(MAX_SETUP_BYTES), setupInput, async (c) =>
    answer(c, await configureCeremony(c.env, c.req.valid("json"))),
  )
  .post("/state", limitBody(MAX_ACTION_BYTES), operatorAction, async (c) =>
    respond(c, await ceremony(c.env).apply({ type: c.req.valid("json").action })),
  )
  .post("/unhold", limitBody(MAX_ACTION_BYTES), unholdBody, async (c) =>
    respond(c, await ceremony(c.env).apply({ type: "unhold", ...c.req.valid("json") })),
  )
  .post("/finalize", limitBody(MAX_FINALIZE_BYTES), finalizeBody, async (c) =>
    respond(c, await ceremony(c.env).finalize(c.req.valid("json"))),
  );
