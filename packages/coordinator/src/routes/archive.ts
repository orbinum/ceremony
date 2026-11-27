/**
 * `/archive/<id>/<file>`: a file of any ceremony this network published, this one included,
 * read-only and served as inert bytes like `/artifacts` (every answer, refusals included), so a
 * finished ceremony stays verifiable after the deployment moves on
 * (`download --from <origin>/archive/<id>`). The list is `GET /api/archive`; `/archive` itself is
 * the page that shows it.
 */
import { Hono } from "hono";
import { archivedArtifact } from "../actions";
import type { AppEnv } from "../env";
import { archiveKey, artifactResponse, fail } from "../http";
import { byNetwork, rateLimit } from "../middleware";

export const archive = new Hono<AppEnv>()
  .use(async (c, next) => {
    await next();
    c.res.headers.set("content-security-policy", "default-src 'none'; sandbox");
  })
  .get("/*", rateLimit("ARTIFACT_LIMIT", byNetwork), archiveKey, async (c) => {
    const { ceremonyId, key } = c.req.valid("param");
    const object = await archivedArtifact(c.env, ceremonyId, key, c.req.header("if-none-match"));
    return object ? artifactResponse(object, key) : fail(c, "not-found", "no such artifact");
  });
