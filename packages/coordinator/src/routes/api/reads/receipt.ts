/** `GET /api/receipt/:seq`: a session's records, cut from the transcript; edge-cached. */
import { Hono } from "hono";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import { edgeCache, fail, seqParam } from "../../../http";
import { readLimit } from "./read-limit";

export const receipt = new Hono<AppEnv>().get(
  "/:seq",
  readLimit,
  seqParam,
  edgeCache,
  async (c) => {
    const r = await ceremony(c.env).receipt(c.req.valid("param").seq);
    return r ? c.json(r) : fail(c, "not-found", "no such session");
  },
);
