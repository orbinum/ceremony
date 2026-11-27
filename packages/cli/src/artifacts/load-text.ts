/**
 * One ceremony document read from disk: bounded, strict UTF-8, parsed by `parse`, with the SHA-256
 * of the exact bytes it was read from.
 */
import { basename } from "node:path";
import { fromUtf8, sha256Hex } from "@orbinum-ceremony/core";
import { readBytes } from "../io";
import type { Loaded } from "./types";

export async function loadText<T>(
  path: string,
  maxBytes: number,
  parse: (text: string) => T,
): Promise<Loaded<T>> {
  const bytes = await readBytes(path, maxBytes);
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new Error(`${basename(path)}: not valid UTF-8`);
  }
  return { value: parse(text), sha256: sha256Hex(bytes) };
}
