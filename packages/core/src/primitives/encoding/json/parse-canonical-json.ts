/**
 * A pinned JSON document from its exact text: parsed, validated, and refused unless the text is
 * `serializeJson` of the validated value. Duplicate keys, reordered or extra whitespace, and any
 * spelling a reader and a tool would read differently are refused.
 */
import { FormatError } from "../../errors";
import { parseJsonText } from "./parse-json-text";
import { serializeJson } from "./serialize-json";

export function parseCanonicalJson<T>(
  text: string,
  what: string,
  validate: (value: unknown) => T,
): T {
  if (typeof text !== "string") throw new FormatError(`${what}: expected text`);
  const value = validate(parseJsonText(text, what));
  if (serializeJson(value) !== text) {
    throw new FormatError(
      `${what}: not in canonical form (two-space JSON, schema key order, final newline)`,
    );
  }
  return value;
}
