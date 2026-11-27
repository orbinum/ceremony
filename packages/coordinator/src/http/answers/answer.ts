/** An action's result as JSON: `{ ok: true, ...value }` with its status, or the refusal. */
import type { Context } from "hono";
import type { Result } from "../../actions";
import { fail } from "./fail";

export const answer = (c: Context, r: Result<Record<string, unknown>>) =>
  r.ok ? c.json({ ok: true, ...r.value }, r.status ?? 200) : fail(c, r.code, r.message);
