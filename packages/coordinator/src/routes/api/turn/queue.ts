/**
 * `/api/queue`: joining, leaving and one's own place. A CLI waits for and leaves its turn with its
 * token; joining stays with the browser. On joining, a coarse per-identity limit bounds the bot
 * check's outbound calls, and the bot check comes before the join quota, so a script without a
 * solve never spends it.
 */
import { slotView } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import { fail, noStore, respond } from "../../../http";
import { browserOnly, contributor, rateLimit, turnstile } from "../../../middleware";

export const queue = new Hono<AppEnv>()
  .use(contributor)
  .post(
    "/join",
    browserOnly,
    rateLimit("ACTION_LIMIT"),
    turnstile,
    rateLimit("JOIN_LIMIT"),
    async (c) =>
      respond(c, await ceremony(c.env).apply({ type: "join", githubId: c.get("githubId") })),
  )
  .post("/leave", rateLimit("ACTION_LIMIT"), async (c) =>
    respond(c, await ceremony(c.env).apply({ type: "leave", githubId: c.get("githubId") })),
  )
  .get("/me", rateLimit("POLL_LIMIT"), noStore, async (c) => {
    const state = await ceremony(c.env).snapshot();
    return state ? c.json(slotView(state, c.get("githubId"))) : fail(c, "not-configured");
  });
