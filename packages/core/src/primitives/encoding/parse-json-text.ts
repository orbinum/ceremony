/**
 * Parses JSON from outside. The error names `what` and never echoes the input: `JSON.parse`
 * quotes the offending bytes, control characters included, into its message.
 */
import { FormatError } from "../errors";

export function parseJsonText(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new FormatError(`${what}: not valid JSON`);
  }
}
