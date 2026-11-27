/**
 * Types the actions share: what an action returns independently of HTTP (a value and its status, or
 * a coded refusal), and who is calling as the session established.
 */
import type { ApiErrorCode } from "@orbinum-ceremony/core";

export type Result<T extends Record<string, unknown> = Record<string, never>> =
  | { ok: true; value: T; status?: 200 | 201 | 202 }
  | { ok: false; code: ApiErrorCode; message?: string };

export interface Caller {
  githubId: number;
  login: string;
}
