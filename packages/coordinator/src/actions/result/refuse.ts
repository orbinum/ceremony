/** An action's coded refusal, with a message only when there is one to give. */
import type { ApiErrorCode } from "@orbinum-ceremony/core";
import type { Result } from "../types";

export const refuse = (code: ApiErrorCode, message?: string): Result<never> => ({
  ok: false,
  code,
  ...(message ? { message } : {}),
});
