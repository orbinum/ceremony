/** An action's success: its value and, unless it is a plain 200, its status. */
import type { Result } from "../types";

export const succeed = <T extends Record<string, unknown>>(
  value: T,
  status?: 200 | 201 | 202,
): Result<T> => ({ ok: true, value, ...(status ? { status } : {}) });
