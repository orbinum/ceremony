/** An unsigned 32-bit integer ≥ `min` (indices, sequence numbers). */
import { asSafeInt } from "./as-safe-int";

export const asU32 = (value: unknown, path: string, min = 1): number =>
  asSafeInt(value, path, min, 2 ** 32 - 1);
