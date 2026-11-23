/**
 * `/admin`, behind `sameOrigin` and `operator` (COORDINATOR §3): the setup files and the frozen setup once, the
 * state actions and lifting an identity's hold, then the final files and the finalization.
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

/** `ceremony.json` and `init.json` as JSON strings (escaping at most doubles them), plus sizes. */
const MAX_SETUP_BYTES = 2 * 2 * MAX_DOCUMENT_BYTES + 64 * 1024;
/** One state action: `{"action":"…"}`. */
const MAX_ACTION_BYTES = 1024;
/** A beacon record (a few relays) and one final record per circuit: a few KB. */
const MAX_FINALIZE_BYTES = 64 * 1024;

/** The `/admin` router. */
export const admin = new Hono<AppEnv>()
  // An operator's browser carries the Access cookie: refuse a foreign page outright, not only
  // through the preflight the marker header forces. The CLI sends neither header.
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
