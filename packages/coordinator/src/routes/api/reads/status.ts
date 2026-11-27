/** `GET /api/status`: phase and counts, nothing about who is in the queue; edge-cached. */
import { publicStatusOf } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { ceremony } from "../../../durable";
import type { AppEnv } from "../../../env";
import { edgeCache, fail } from "../../../http";
import { readLimit } from "./read-limit";

export const status = new Hono<AppEnv>().get("/", readLimit, edgeCache, async (c) => {
  const state = await ceremony(c.env).snapshot();
  return state ? c.json(publicStatusOf(state)) : fail(c, "not-configured");
});
