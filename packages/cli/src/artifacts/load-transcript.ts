/** `transcript.json`, validated by schema only: its anchor and chain are checked by the caller. */
import { basename } from "node:path";
import {
  MAX_TRANSCRIPT_BYTES,
  parseJsonText,
  type Transcript,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { layout } from "./layout";
import { loadText } from "./load-text";
import type { Loaded } from "./types";

export const loadTranscript = (
  dir: string,
  path = layout(dir).transcript,
): Promise<Loaded<Transcript>> =>
  loadText(path, MAX_TRANSCRIPT_BYTES, (text) =>
    validateTranscript(parseJsonText(text, basename(path))),
  );
