/** `/api/queue`: joining, leaving and one's own place (SPEC §4.1 steps 3–4). */
import { slotView } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { ceremony } from "../../durable";
import type { AppEnv } from "../../env";
import { fail, noStore, respond } from "../../http";
import { browserOnly, contributor, rateLimit, turnstile } from "../../middleware";

/** The `/api/queue` router. */
export const queue = new Hono<AppEnv>()
  // A CLI waits for and leaves its turn with its token (SPEC §4.4); joining stays with the browser.
  .use(contributor)
  // The bot check first: a script without a solve never spends the identity's quota.
  .post("/join", browserOnly, turnstile, rateLimit("JOIN_LIMIT"), async (c) =>
    respond(c, await ceremony(c.env).apply({ type: "join", githubId: c.get("githubId") })),
  )
  .post("/leave", rateLimit("ACTION_LIMIT"), async (c) =>
    respond(c, await ceremony(c.env).apply({ type: "leave", githubId: c.get("githubId") })),
  )
  .get("/me", rateLimit("POLL_LIMIT"), noStore, async (c) => {
    const state = await ceremony(c.env).snapshot();
    return state ? c.json(slotView(state, c.get("githubId"))) : fail(c, "not-configured");
  });
