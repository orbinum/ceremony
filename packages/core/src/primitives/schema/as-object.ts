/** A plain object (not null, not an array), or a `FormatError` naming the field path. */
import { fail } from "./fail";

export function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  return value as Record<string, unknown>;
}
