/**
 * Every answer that is not a success, in one shape: `{ error: { code, message } }` (core's codes).
 * COORDINATOR §3.
 */
import { type ApiErrorCode, apiErrorStatus } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Result } from "../actions";
import type { Outcome } from "../durable";
import { StorageError } from "../storage";

/** A coded error answer with its status. */
export const fail = (c: Context, code: ApiErrorCode, message: string = code) =>
  c.json({ error: { code, message } }, apiErrorStatus(code));

/** A refusal's problems as its message, if it lists any. */
const problemsOf = (o: Extract<Outcome, { ok: false }>) => o.problems?.join("; ") || undefined;

/** An outcome as JSON: `{ ok: true, ...body }`, or the refusal (its problems as the message). */
export const respond = (c: Context, outcome: Outcome, body: Record<string, unknown> = {}) =>
  outcome.ok ? c.json({ ok: true, ...body }) : fail(c, outcome.refusal, problemsOf(outcome));

/** An action's result as JSON: `{ ok: true, ...value }` with its status, or the refusal. */
export const answer = (c: Context, r: Result<Record<string, unknown>>) =>
  r.ok ? c.json({ ok: true, ...r.value }, r.status ?? 200) : fail(c, r.code, r.message);

/**
 * Unexpected errors: logged in full, answered without internals. A body Hono could not parse
 * (malformed JSON) is the caller's: `malformed`; a failed bucket call is `storage` (retry).
 */
export function onError(error: Error, c: Context) {
  if (error instanceof HTTPException && error.status === 400) return fail(c, "malformed");
  console.error(error);
  if (error instanceof StorageError) return fail(c, "storage", "storage unavailable; try again");
  return fail(c, "internal", "internal error");
}
