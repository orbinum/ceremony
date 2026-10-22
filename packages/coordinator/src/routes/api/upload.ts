/** `/api/session/upload/:circuit`: one circuit's streamed upload (SPEC §2.5), browser or CLI. */
import { Hono } from "hono";
import { receiveUpload } from "../../actions";
import type { AppEnv } from "../../env";
import { answer, circuitParam, uploadInput } from "../../http";
import { contributor, rateLimit } from "../../middleware";

/** The `/api/session/upload` router. */
export const upload = new Hono<AppEnv>()
  .use(contributor)
  .put("/:circuit", rateLimit("UPLOAD_LIMIT"), circuitParam, uploadInput, async (c) =>
    answer(
      c,
      await receiveUpload(
        c.env,
        {
          githubId: c.get("githubId"),
          via: c.get("via"),
          ...c.req.valid("param"),
          ...c.req.valid("header"),
        },
        (p) => c.executionCtx.waitUntil(p),
      ),
    ),
  );
