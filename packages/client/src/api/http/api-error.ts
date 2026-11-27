/**
 * A coordinator refusal (`{ error: { code, message } }`) or failure; any other non-2xx answer
 * becomes one too, as `internal`.
 */
import type { ApiErrorCode } from "@orbinum-ceremony/core";

export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}
