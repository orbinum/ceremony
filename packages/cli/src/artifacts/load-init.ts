/** `genesis/init.json`, validated and canonical (core's loader), with the SHA-256 of its bytes. */
import { type InitRecord, MAX_DOCUMENT_BYTES, parseInit } from "@orbinum-ceremony/core";
import { layout } from "./layout";
import { loadText } from "./load-text";
import type { Loaded } from "./types";

export const loadInit = (dir: string, path = layout(dir).init): Promise<Loaded<InitRecord>> =>
  loadText(path, MAX_DOCUMENT_BYTES, parseInit);
