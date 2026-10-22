/** UTF-8 codec and text read from outside. Decoding is strict: invalid UTF-8 is an error. */
import { FormatError } from "../errors";

const encoder = new TextEncoder();
// `ignoreBOM: true` keeps a byte-order mark in the text, so pinned documents with one are not canonical.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** String → UTF-8 bytes. */
export const utf8 = (text: string): Uint8Array => encoder.encode(text);

/** UTF-8 bytes → string; throws `TypeError` on invalid UTF-8. */
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

/**
 * Parses JSON from outside. The error names `what` and never echoes the input: `JSON.parse`
 * quotes the offending bytes, control characters included, into its message.
 */
export function parseJsonText(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new FormatError(`${what}: not valid JSON`);
  }
}

/**
 * The bytes of a published JSON document, as every tool writes them: two-space indentation and a
 * final newline. A pinned document must be exactly this serialization of its validated value.
 */
export const serializeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * A pinned JSON document from its exact text: parsed, validated, and refused unless the text is
 * `serializeJson` of the validated value. Duplicate keys, reordered or extra whitespace, and any
 * spelling a reader and a tool would read differently are refused.
 */
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

/**
 * C0 controls but tab and newline, DEL, C1 controls, and the invisible format characters a
 * terminal would render as nothing: bidi marks, overrides and isolates, zero-width characters,
 * line and paragraph separators, the BOM.
 */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/**
 * Text from outside made safe for a terminal: escape sequences and bidi controls become `?`, so
 * nothing can move the cursor, recolour or hide what is printed. Other Unicode stays readable.
 */
export const stripControl = (text: string): string => text.replace(CONTROL, "?");
