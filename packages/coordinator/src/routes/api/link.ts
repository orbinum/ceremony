/** `/api/link`: the caller's linked wallet, a link nonce, and a link (SPEC §3.4). */
import { Hono } from "hono";
import { linkedWallet, linkWallet } from "../../actions";
import { ceremony } from "../../durable";
import type { AppEnv } from "../../env";
import { answer, fail, limitBody, linkRequest, noStore } from "../../http";
import { identity, rateLimit } from "../../middleware";

/** A link request is a payload and a signature: a few hundred bytes. */
const MAX_LINK_BYTES = 64 * 1024;

/** The `/api/link` router. */
export const link = new Hono<AppEnv>()
  .use(identity, noStore)
  .get("/", rateLimit("POLL_LIMIT"), async (c) =>
    c.json(await linkedWallet(c.env, c.get("githubId"))),
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
