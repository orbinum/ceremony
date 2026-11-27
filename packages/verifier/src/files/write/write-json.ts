/** `value` as indented JSON (`serializeJson`), written atomically. */
import { serializeJson } from "@orbinum-ceremony/core";
import { writeAtomic } from "./write-atomic";

export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeAtomic(path, serializeJson(value));
