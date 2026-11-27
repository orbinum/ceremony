/**
 * A JSON file read from outside: bounded, strict UTF-8, and an error that names the file and never
 * echoes its content. Returns the parsed value and the exact bytes it came from.
 */
import { basename } from "node:path";
import { fromUtf8, parseJsonText } from "@orbinum-ceremony/core";
import { readBytes } from "./read-bytes";

export async function readJsonFile(
  path: string,
  maxBytes: number,
): Promise<{ value: unknown; bytes: Uint8Array }> {
  const bytes = await readBytes(path, maxBytes);
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new Error(`${basename(path)}: not valid UTF-8`);
  }
  return { value: parseJsonText(text, basename(path)), bytes };
}
