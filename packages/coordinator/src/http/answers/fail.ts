/**
 * A coded error answer with its status: every answer that is not a success has the one shape
 * `{ error: { code, message } }`, with core's codes.
 */
import { type ApiErrorCode, apiErrorStatus } from "@orbinum-ceremony/core";
import type { Context } from "hono";

export const fail = (c: Context, code: ApiErrorCode, message: string = code) =>
  c.json({ error: { code, message } }, apiErrorStatus(code));
