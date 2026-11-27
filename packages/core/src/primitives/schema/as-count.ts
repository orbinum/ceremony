/** A non-negative safe integer (counts, sizes). */
import { asSafeInt } from "./as-safe-int";

export const asCount = (value: unknown, path: string): number =>
  asSafeInt(value, path, 0, Number.MAX_SAFE_INTEGER);
