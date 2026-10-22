/**
 * The deployment's configuration, checked once per isolate before the first request is served
 * (`configProblems`): a coordinator with a weak key, a plaintext verifier or a malformed ceremony
 * id answers nothing but `internal`. COORDINATOR §3.
 */
import { createMiddleware } from "hono/factory";
import { type AppEnv, configProblems } from "../env";
import { fail } from "../http";

/** The problems found for each set of bindings (one per isolate in a deployment). */
const checked = new WeakMap<Env, string[]>();

/** Refuses every request while the configuration is unusable. */
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
