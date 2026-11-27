/** A Durable Object outcome as JSON: `{ ok: true, ...body }`, or the refusal with its problems as the message. */
import type { Context } from "hono";
import type { Outcome } from "../../durable";
import { fail } from "./fail";

const problemsOf = (o: Extract<Outcome, { ok: false }>) => o.problems?.join("; ") || undefined;

export const respond = (c: Context, outcome: Outcome, body: Record<string, unknown> = {}) =>
  outcome.ok ? c.json({ ok: true, ...body }) : fail(c, outcome.refusal, problemsOf(outcome));
