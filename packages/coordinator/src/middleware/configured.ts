/**
 * Refuses every request while the deployment's configuration is unusable, checked once per set of
 * bindings (one per isolate) before the first request is served: a coordinator with a weak key, a
 * plaintext verifier or a malformed ceremony id answers nothing but `internal`, and logs why.
 */
import { createMiddleware } from "hono/factory";
import { type AppEnv, configProblems } from "../env";
import { fail } from "../http";

const checked = new WeakMap<Env, string[]>();

export const configured = createMiddleware<AppEnv>(async (c, next) => {
  let problems = checked.get(c.env);
  if (!problems) {
    problems = configProblems(c.env);
    checked.set(c.env, problems);
    if (problems.length > 0) console.error(`configuration: ${problems.join("; ")}`);
  }
  if (problems.length > 0) return fail(c, "internal", "internal error");
  return next();
});
