/**
 * A well-formed Unicode string of at most `maxLength` UTF-16 units, optionally matching `pattern`.
 * Lone surrogates are refused, so the value stays JCS-serializable.
 */
import { fail } from "./fail";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function asString(
  value: unknown,
  path: string,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (typeof value !== "string") return fail(path, "expected a string");
  if (value.length > maxLength) fail(path, `longer than ${maxLength}`);
  if (LONE_SURROGATE.test(value)) fail(path, "invalid Unicode");
  if (pattern && !pattern.test(value)) fail(path, `does not match ${pattern}`);
  return value;
}
