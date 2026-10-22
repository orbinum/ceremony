/**
 * The ceremony's JSON documents read from disk: bounded, strict UTF-8, validated by core; the two
 * pinned documents also in their canonical bytes (core's loaders). SPEC §6.
 */
import { basename } from "node:path";
import {
  type CeremonyAnnouncement,
  checkInitAgainstAnnouncement,
  fromUtf8,
  type InitRecord,
  MAX_DOCUMENT_BYTES,
  MAX_TRANSCRIPT_BYTES,
  parseAnnouncement,
  parseInit,
  parseJsonText,
  sha256Hex,
  type Transcript,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { readBytes } from "../io";
import { layout } from "./layout";

/** A validated document plus the SHA-256 of the exact bytes it was read from. */
export interface Loaded<T> {
  value: T;
  sha256: string;
}

async function loadText<T>(
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

/** `ceremony.json`, validated and canonical, with the SHA-256 of its bytes. */
export const loadAnnouncement = (
  dir: string,
  path = layout(dir).announcement,
): Promise<Loaded<CeremonyAnnouncement>> => loadText(path, MAX_DOCUMENT_BYTES, parseAnnouncement);

/** `genesis/init.json`, validated and canonical, with the SHA-256 of its bytes. */
export const loadInit = (dir: string, path = layout(dir).init): Promise<Loaded<InitRecord>> =>
  loadText(path, MAX_DOCUMENT_BYTES, parseInit);

/** `transcript.json`, validated (schema only: anchor and chain are checked by the caller). */
export const loadTranscript = (
  dir: string,
  path = layout(dir).transcript,
): Promise<Loaded<Transcript>> =>
  loadText(path, MAX_TRANSCRIPT_BYTES, (text) =>
    validateTranscript(parseJsonText(text, basename(path))),
  );

/**
 * The announcement and the init it pins: same ceremony, and `init.json` byte-for-byte the one the
 * announcement hashed (SPEC §6.2).
 */
export async function loadCeremony(dir: string) {
  const announcement = await loadAnnouncement(dir);
  const init = await loadInit(dir);
  const problems = checkInitAgainstAnnouncement(announcement.value, init.value, init.sha256);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { announcement, init };
}
