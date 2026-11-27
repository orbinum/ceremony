/** A positive safe integer (ids, rounds). */
import { asSafeInt } from "./as-safe-int";

export const asPositiveInt = (value: unknown, path: string): number =>
  asSafeInt(value, path, 1, Number.MAX_SAFE_INTEGER);
