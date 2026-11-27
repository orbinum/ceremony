/** `GET /api/transcript`: every record, hash-chained; edge-cached. */
import { Hono } from "hono";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import { edgeCache, fail } from "../../../http";
import { readLimit } from "./read-limit";

export const transcript = new Hono<AppEnv>().get("/", readLimit, edgeCache, async (c) => {
  const t = await ceremony(c.env).transcript();
  return t ? c.json(t) : fail(c, "not-configured");
});
