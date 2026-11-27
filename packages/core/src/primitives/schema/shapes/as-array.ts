/** A dense array of at most `maxLength` items (and at least `minLength`); holes are refused. */
import { fail } from "../fail";

export function asArray(value: unknown, path: string, maxLength: number, minLength = 0): unknown[] {
  if (!Array.isArray(value)) return fail(path, "expected an array");
  if (value.length > maxLength) fail(path, `more than ${maxLength} items`);
  if (value.length < minLength) fail(path, `fewer than ${minLength} items`);
  for (let i = 0; i < value.length; i++) if (!(i in value)) fail(`${path}[${i}]`, "missing item");
  return value;
}
