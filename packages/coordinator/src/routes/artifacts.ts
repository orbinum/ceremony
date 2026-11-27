/** `/artifacts/*`: the public bucket, read-only, every answer (refusals included) inert bytes. */
import { Hono } from "hono";
import { publicArtifact } from "../actions";
import type { AppEnv } from "../env";
import { artifactKey, artifactResponse, fail } from "../http";
import { byNetwork, rateLimit } from "../middleware";

export const artifacts = new Hono<AppEnv>()
  .use(async (c, next) => {
    await next();
    c.res.headers.set("content-security-policy", "default-src 'none'; sandbox");
  })
  .get("/*", rateLimit("ARTIFACT_LIMIT", byNetwork), artifactKey, async (c) => {
    const key = c.req.valid("param").key;
    const object = await publicArtifact(c.env, key, c.req.header("if-none-match"));
    return object ? artifactResponse(object, key) : fail(c, "not-found", "no such artifact");
  });
