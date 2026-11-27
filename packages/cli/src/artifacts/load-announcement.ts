/** `ceremony.json`, validated and canonical (core's loader), with the SHA-256 of its bytes. */
import {
  type CeremonyAnnouncement,
  MAX_DOCUMENT_BYTES,
  parseAnnouncement,
} from "@orbinum-ceremony/core";
import { layout } from "./layout";
import { loadText } from "./load-text";
import type { Loaded } from "./types";

export const loadAnnouncement = (
  dir: string,
  path = layout(dir).announcement,
): Promise<Loaded<CeremonyAnnouncement>> => loadText(path, MAX_DOCUMENT_BYTES, parseAnnouncement);
