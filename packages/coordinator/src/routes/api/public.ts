/**
 * Public reads (SPEC §6.3): the live status, the transcript so far and a session's receipt. No
 * identity, rate-limited per client network, served from the edge cache (KL-36).
 */
import { publicStatusOf } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { ceremony } from "../../durable";
import { type AppEnv, isLocal } from "../../env";
import { edgeCache, fail, seqParam } from "../../http";
import { byNetwork, rateLimit } from "../../middleware";

const readLimit = rateLimit("READ_LIMIT", byNetwork);

/** The network a deployment runs, by its ENVIRONMENT (one Worker and domain per network). */
const NETWORK_OF = { production: "mainnet", testnet: "testnet", local: "local" } as const;

/**
 * `GET /api/config`: what the page needs from this deployment: its network, and the Turnstile
 * site key (null on a local run, which needs no widget). Public by design; one client build
 * serves every network.
 */
export const config = new Hono<AppEnv>().get("/", readLimit, (c) =>
  c.json({
    network: NETWORK_OF[c.env.ENVIRONMENT as keyof typeof NETWORK_OF] ?? null,
    turnstileSiteKey: isLocal(c.env, c.req.url) ? null : c.env.TURNSTILE_SITE_KEY || null,
  }),
);

/** `GET /api/status`: phase and counts, nothing about who is in the queue. */
export const status = new Hono<AppEnv>().get("/", readLimit, edgeCache, async (c) => {
  const state = await ceremony(c.env).snapshot();
  return state ? c.json(publicStatusOf(state)) : fail(c, "not-configured");
});

/** `GET /api/transcript`: every record, hash-chained. */
export const transcript = new Hono<AppEnv>().get("/", readLimit, edgeCache, async (c) => {
  const t = await ceremony(c.env).transcript();
  return t ? c.json(t) : fail(c, "not-configured");
});

/** `GET /api/receipt/:seq`: a session's records, cut from the transcript. */
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
