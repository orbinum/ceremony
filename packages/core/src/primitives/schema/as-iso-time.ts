/** An ISO 8601 UTC timestamp in the exact form `Date#toISOString` produces, and no other. */
import { asString } from "./as-string";
import { fail } from "./fail";

export function asIsoTime(value: unknown, path: string): string {
  const s = asString(value, path, 32);
  const t = Date.parse(s);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== s) {
    fail(path, "expected an ISO timestamp");
  }
  return s;
}
