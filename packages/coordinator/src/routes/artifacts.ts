/** `/artifacts/*`: the public bucket, read-only, served as inert bytes (SPEC §6.1). */
import { Hono } from "hono";
import { publicArtifact } from "../actions";
import type { AppEnv } from "../env";
import { artifactKey, artifactResponse, fail } from "../http";
import { byNetwork, rateLimit } from "../middleware";

/** The `/artifacts` router. */
export const artifacts = new Hono<AppEnv>()
  // Every answer inert, refusals included.
  .use(async (c, next) => {
    await next();
    c.res.headers.set("content-security-policy", "default-src 'none'; sandbox");
  })
  .get("/*", rateLimit("ARTIFACT_LIMIT", byNetwork), artifactKey, async (c) => {
    const object = await publicArtifact(c.env, c.req.valid("param").key);
    return object ? artifactResponse(object) : fail(c, "not-found", "no such artifact");
  });
