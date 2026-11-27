/** A coordinator response as its JSON answer, or the `ApiError` it stands for. */
import type { ApiErrorCode } from "@orbinum-ceremony/core";
import { ApiError } from "./api-error";

export async function answerOf<T>(r: Response): Promise<T> {
  const json: unknown = await r.json().catch(() => null);
  if (r.ok) return json as T;
  const error = (json as { error?: { code?: ApiErrorCode; message?: string } } | null)?.error;
  throw new ApiError(r.status, error?.code ?? "internal", error?.message ?? r.statusText);
}
