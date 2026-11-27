/**
 * `/api/link`: who is signed in and their linked wallet (all a link payload names but the nonce),
 * a link nonce, and a link (a payload and a signature: a few hundred bytes, bounded at 64 KiB).
 */
import { Hono } from "hono";
import { linkedWallet, linkWallet } from "../../../actions";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import { answer, fail, limitBody, linkRequest, noStore } from "../../../http";
import { identity, rateLimit } from "../../../middleware";

const MAX_LINK_BYTES = 64 * 1024;

export const link = new Hono<AppEnv>()
  .use(identity, noStore)
  .get("/", rateLimit("POLL_LIMIT"), async (c) =>
    c.json(await linkedWallet(c.env, { githubId: c.get("githubId"), login: c.get("login") })),
  )
  .post("/nonce", rateLimit("NONCE_LIMIT"), async (c) => {
    const r = await ceremony(c.env).issueNonce(c.get("githubId"));
    return r.ok ? c.json({ nonce: r.nonce, expiresAt: r.expiresAt }) : fail(c, r.refusal);
  })
  .post("/", rateLimit("ACTION_LIMIT"), limitBody(MAX_LINK_BYTES), linkRequest, async (c) =>
    answer(
      c,
      await linkWallet(
        c.env,
        { githubId: c.get("githubId"), login: c.get("login") },
        c.req.valid("json"),
      ),
    ),
  );
