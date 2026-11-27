/**
 * `GET /api/config`: what the page needs from this deployment: its network (by `ENVIRONMENT`, one
 * Worker and domain per network) and the Turnstile site key (null on a local run, which needs no
 * widget). Public by design; one client build serves every network.
 */
import { Hono } from "hono";
import { type AppEnv, isLocal } from "../../../env";
import { readLimit } from "./read-limit";

const NETWORK_OF = { production: "mainnet", testnet: "testnet", local: "local" } as const;

export const config = new Hono<AppEnv>().get("/", readLimit, (c) =>
  c.json({
    network: NETWORK_OF[c.env.ENVIRONMENT as keyof typeof NETWORK_OF] ?? null,
    turnstileSiteKey: isLocal(c.env, c.req.url) ? null : c.env.TURNSTILE_SITE_KEY || null,
  }),
);
