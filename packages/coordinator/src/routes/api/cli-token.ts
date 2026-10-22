/** `/api/cli-token`: a contributor's CLI token, minted in the browser (SPEC §4.4). */
import { Hono } from "hono";
import { issueCliToken } from "../../actions";
import type { AppEnv } from "../../env";
import { answer, noStore } from "../../http";
import { identity, rateLimit } from "../../middleware";

/** The `/api/cli-token` router. */
export const cliToken = new Hono<AppEnv>()
  .use(identity)
  .post("/", rateLimit("ACTION_LIMIT"), noStore, async (c) =>
    answer(
      c,
      await issueCliToken(c.env, {
        githubId: c.get("githubId"),
        login: c.get("login"),
        until: c.get("until"),
      }),
    ),
  );
