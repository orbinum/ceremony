/** A safe integer in `[min, max]`: never a string, a float, NaN or a value that lost precision. */
import { fail } from "./fail";

export function asSafeInt(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    return fail(path, `expected an integer in [${min}, ${max}]`);
  }
  return value as number;
}
