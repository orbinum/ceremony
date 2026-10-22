/** What an action returns: a value and its status, or a coded refusal. COORDINATOR §3. */
import type { ApiErrorCode } from "@orbinum-ceremony/core";
import type { Outcome } from "../durable";

/** An action's result, independent of HTTP. */
export type Result<T extends Record<string, unknown> = Record<string, never>> =
  | { ok: true; value: T; status?: 200 | 201 | 202 }
  | { ok: false; code: ApiErrorCode; message?: string };

/** A success. */
export const succeed = <T extends Record<string, unknown>>(
  value: T,
  status?: 200 | 201 | 202,
): Result<T> => ({ ok: true, value, ...(status ? { status } : {}) });

/** A refusal. */
export const refuse = (code: ApiErrorCode, message?: string): Result<never> => ({
  ok: false,
  code,
  ...(message ? { message } : {}),
});

/** A Durable Object outcome as a result: effects stay internal, problems are the message. */
export const fromOutcome = (o: Outcome): Result =>
  o.ok ? succeed({}) : refuse(o.refusal, o.problems?.join("; ") || undefined);
