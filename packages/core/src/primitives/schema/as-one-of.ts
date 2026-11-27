/** One of a fixed set of strings. */
import { fail } from "./fail";

export function asOneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (!options.includes(value as T)) return fail(path, `expected one of ${options.join(", ")}`);
  return value as T;
}
