/**
 * `/internal`: the verifier's side, HMAC-authenticated, each request taken once (its MAC is spent,
 * so a replay in its window is refused), then bounded (a report carries the verify log, JSON-escaped
 * up to twice its length, and a few KB more). It reads the upload of a pending job (no R2
 * credentials outside the Worker) and posts the result, idempotently. No rate limit runs ahead of
 * the MAC: a shared per-network bucket would let anyone on the verifier's network throttle the
 * verifier itself, and the MAC is checked before any body byte is read.
 */
import { MAX_LOG_CHARS, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { pendingUpload } from "../actions";
import { ceremony } from "../durable";
import type { AppEnv } from "../env";
import { fail, jobIdParam, limitBody, objectResponse, reportBody } from "../http";
import { verifierBody, verifierHeaders } from "../middleware";

const MAX_REPORT_BYTES = 2 * MAX_LOG_CHARS + 64 * 1024;

const once = createMiddleware<AppEnv>(async (c, next) => {
  const spent = await ceremony(c.env).spendRequestMac(
    c.req.header(SIGNATURE_HEADER) as string,
    Number(c.req.header(TIMESTAMP_HEADER)),
  );
  return spent ? next() : fail(c, "unauthenticated", "replayed request");
});

export const internal = new Hono<AppEnv>()
  .use(verifierHeaders, once, limitBody(MAX_REPORT_BYTES), verifierBody)
  .get("/objects/:seq/:circuit/:attempt", jobIdParam, async (c) => {
    const object = await pendingUpload(c.env, c.req.valid("param"));
    return object ? objectResponse(object) : fail(c, "unknown-job", "no pending job with that id");
  })
  .post("/verifications", reportBody, async (c) => {
    const r = await ceremony(c.env).report(c.req.valid("json"));
    return r.ok ? c.json({ ok: true, status: r.status }) : fail(c, r.refusal);
  });
