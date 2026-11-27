/**
 * `/api/session`: the active slot. Claim it and keep it with heartbeats (within core's
 * `QUEUE_RULES`), download each head, poll each upload's result (`pending`, then the verifier's
 * result, or `stale` if it ended without one), finish or attest. A CLI drives the slot with its
 * token; the attestation (one payload and one signature, a few KB) stays with the browser.
 */
import { headView, jobResultView } from "@orbinum-ceremony/core";
import { type Context, Hono } from "hono";
import { attestSession, claimTurn } from "../../../actions";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import {
  answer,
  attestationBody,
  circuitParam,
  fail,
  limitBody,
  noStore,
  respond,
} from "../../../http";
import { browserOnly, contributor, rateLimit } from "../../../middleware";

const MAX_ATTESTATION_BYTES = 64 * 1024;

const slotEvent = (type: "heartbeat" | "finish") => async (c: Context<AppEnv>) =>
  respond(c, await ceremony(c.env).apply({ type, githubId: c.get("githubId") }));

export const session = new Hono<AppEnv>()
  .use(contributor)
  .post("/claim", rateLimit("ACTION_LIMIT"), async (c) =>
    respond(c, await claimTurn(c.env, c.get("githubId"), (p) => c.executionCtx.waitUntil(p))),
  )
  .post("/heartbeat", rateLimit("ACTION_LIMIT"), slotEvent("heartbeat"))
  .post("/finish", rateLimit("ACTION_LIMIT"), slotEvent("finish"))
  .get("/head/:circuit", rateLimit("POLL_LIMIT"), noStore, circuitParam, async (c) => {
    const { circuit } = c.req.valid("param");
    const head = await ceremony(c.env).head(circuit);
    return head ? c.json(headView(head, circuit)) : fail(c, "not-configured");
  })
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
