/**
 * Guards `/admin/*`: the operator's marker header (a custom header forces a CORS preflight, so no
 * page can make an operator's browser call them), a valid Cloudflare Access token for this
 * application, and an identity on the `ACCESS_OPERATORS` list; each admitted call is logged. A
 * local run serves them without Access.
 */
import { OPERATOR_HEADER } from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import { type AppEnv, isLocal } from "../env";
import { fail } from "../http";
import { ACCESS_HEADER, verifyAccess } from "../services";

const operatorsOf = (env: Env) =>
  new Set(
    env.ACCESS_OPERATORS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const operator = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.header(OPERATOR_HEADER) !== "1") {
    return fail(c, "forbidden", `${OPERATOR_HEADER}: 1 is required`);
  }
  if (isLocal(c.env, c.req.url)) return next();
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience } = c.env;
  const who =
    team && audience ? await verifyAccess(c.req.header(ACCESS_HEADER), team, audience) : null;
  if (who === null || !operatorsOf(c.env).has(who)) {
    return fail(c, "forbidden", "operator access required");
  }
  console.log(`operator ${who}: ${c.req.method} ${new URL(c.req.url).pathname}`);
  return next();
});
