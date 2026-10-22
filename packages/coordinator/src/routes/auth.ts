/**
 * `/auth`: sign-in with GitHub, its callback, and sign-out (SPEC §3.2), limited per client network
 * (each callback costs a GitHub token request). The outcome goes back as `/?auth=…`.
 */
import { signInQuery } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { completeSignIn, startSignIn } from "../actions";
import type { AppEnv } from "../env";
import { byNetwork, rateLimit } from "../middleware";
import { endSession, recallOAuth, rememberOAuth, startSession } from "../session";

const originOf = (url: string) => new URL(url).origin;

/** The `/auth` router. */
export const auth = new Hono<AppEnv>()
  .use(rateLimit("AUTH_LIMIT", byNetwork))
  .get("/github", (c) => {
    const { state, verifier, url } = startSignIn(c.env, originOf(c.req.url));
    rememberOAuth(c, state, verifier);
    return c.redirect(url);
  })
  .get("/github/callback", async (c) => {
    const { outcome, profile } = await completeSignIn(
      c.env,
      originOf(c.req.url),
      c.req.query(),
      recallOAuth(c),
    );
    if (profile) startSession(c, profile.id, profile.login);
    return c.redirect(`/?${signInQuery(outcome)}`);
  })
  .post("/logout", (c) => {
    endSession(c);
    return c.json({ ok: true });
  });
