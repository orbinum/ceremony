/**
 * A release tag name as git accepts one, so `refs/tags/<tag>` names that tag and nothing else:
 * never `HEAD`, a full ref, a commit id spelled as a tag, or what `git check-ref-format` refuses
 * (`..`, `@{`, a component starting with `.` or ending in `.lock`).
 */
import { FormatError } from "../../../primitives/errors";
import { asString } from "../../../primitives/schema";

const BAD_REF = /\.\.|@\{|\/\/|^\/|\/$|\.$|\.lock(\/|$)|(^|\/)\./;

export function asTag(value: unknown, path: string): string {
  const tag = asString(value, path, 100, /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/);
  if (
    tag === "HEAD" ||
    tag.startsWith("refs/") ||
    /^[0-9a-fA-F]{7,40}$/.test(tag) ||
    BAD_REF.test(tag)
  ) {
    throw new FormatError(`${path}: not a tag name`);
  }
  return tag;
}
