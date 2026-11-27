/**
 * `GET /api/archive`: the ceremonies this network announced (`/archive/<id>/*` serves their files),
 * and which one this deployment runs, only once it is announced: the next ceremony's name is not
 * public before its announcement. Edge-cached.
 */
import { Hono } from "hono";
import { publishedCeremonies } from "../../../actions";
import type { AppEnv } from "../../../env";
import { edgeCache } from "../../../http";
import { readLimit } from "./read-limit";

export const archived = new Hono<AppEnv>().get("/", readLimit, edgeCache, async (c) => {
  const ceremonies = await publishedCeremonies(c.env);
  const current = ceremonies.includes(c.env.CEREMONY_ID) ? c.env.CEREMONY_ID : null;
  return c.json({ current, ceremonies });
});
