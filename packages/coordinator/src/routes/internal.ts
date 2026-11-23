/**
 * `/internal`: the verifier's side (COORDINATOR §5), bounded, then HMAC-authenticated. It reads
 * the upload of a pending job (no R2 credentials outside the Worker) and posts the result,
 * idempotently.
 */
import { MAX_LOG_CHARS } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { pendingUpload } from "../actions";
import { ceremony } from "../durable";
import type { AppEnv } from "../env";
import { fail, jobIdParam, limitBody, objectResponse, reportBody } from "../http";
import { verifierAuth, verifierHeaders } from "../middleware";

/** A report carries the verify log (JSON-escaped, up to twice its length) and a few KB more. */
const MAX_REPORT_BYTES = 2 * MAX_LOG_CHARS + 64 * 1024;

/** The `/internal` router. */
export const internal = new Hono<AppEnv>()
  // No rate limit ahead of the MAC: a shared per-network bucket would let anyone on the verifier's
  // network throttle the verifier itself. Headers are judged before any body byte is read; a
  // request with fresh headers costs one bounded body read and one HMAC (KL-54).
  .use(verifierHeaders, limitBody(MAX_REPORT_BYTES), verifierAuth)
  .get("/objects/:seq/:circuit/:attempt", jobIdParam, async (c) => {
    const object = await pendingUpload(c.env, c.req.valid("param"));
    return object ? objectResponse(object) : fail(c, "unknown-job", "no pending job with that id");
  })
  .post("/verifications", reportBody, async (c) => {
    const r = await ceremony(c.env).report(c.req.valid("json"));
    return r.ok ? c.json({ ok: true, status: r.status }) : fail(c, r.refusal);
  });
