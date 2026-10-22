/**
 * `/api/session`: the active slot (SPEC §4.1–4.2). Claim it and keep it with heartbeats (within
 * core's `QUEUE_RULES`), download each head, poll each upload's result, finish or attest.
 */
import { headView, jobResultView } from "@orbinum-ceremony/core";
import { type Context, Hono } from "hono";
import { attestSession } from "../../actions";
import { ceremony } from "../../durable";
import type { AppEnv } from "../../env";
import {
  answer,
  attestationBody,
  circuitParam,
  fail,
  limitBody,
  noStore,
  respond,
} from "../../http";
import { browserOnly, contributor, rateLimit } from "../../middleware";

/** An attestation is one payload and one signature: a few KB. */
const MAX_ATTESTATION_BYTES = 64 * 1024;

/** The caller's slot event. */
const slotEvent = (type: "claim" | "heartbeat" | "finish") => async (c: Context<AppEnv>) =>
  respond(c, await ceremony(c.env).apply({ type, githubId: c.get("githubId") }));

/** The `/api/session` router. */
export const session = new Hono<AppEnv>()
  // A CLI drives the slot with its token (SPEC §4.4); the attestation stays with the browser.
  .use(contributor)
  .post("/claim", rateLimit("ACTION_LIMIT"), slotEvent("claim"))
  .post("/heartbeat", rateLimit("ACTION_LIMIT"), slotEvent("heartbeat"))
  .post("/finish", rateLimit("ACTION_LIMIT"), slotEvent("finish"))
  .get("/head/:circuit", rateLimit("POLL_LIMIT"), noStore, circuitParam, async (c) => {
    const { circuit } = c.req.valid("param");
    const head = await ceremony(c.env).head(circuit);
    return head ? c.json(headView(head, circuit)) : fail(c, "not-configured");
  })
  /** `pending`, then the verifier's result; `stale` if it ended without one. */
  .get("/result/:circuit", rateLimit("POLL_LIMIT"), noStore, circuitParam, async (c) => {
    const job = await ceremony(c.env).latestJob(c.get("githubId"), c.req.valid("param").circuit);
    return job ? c.json(jobResultView(job)) : fail(c, "unknown-job", "no upload of this circuit");
  })
  .post(
    "/attest",
    browserOnly,
    rateLimit("ACTION_LIMIT"),
    limitBody(MAX_ATTESTATION_BYTES),
    attestationBody,
    async (c) => answer(c, await attestSession(c.env, c.get("githubId"), c.req.valid("json").body)),
  );
