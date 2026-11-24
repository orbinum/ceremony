/**
 * The operator's transcript on disk: opened only if anchored and chained, appended record by
 * record. SPEC §6.3.
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  appendRecord,
  type CeremonyAnnouncement,
  type Chained,
  chainGenesis,
  checkAnchor,
  type Transcript,
  transcriptOf,
  type TranscriptRecord,
  verifyChain,
} from "@orbinum-ceremony/core";
import { layout, type Loaded, loadTranscript } from "../artifacts";
import { writeJson } from "../io";

/** Whether any circuit has a contribution file on disk (every directory under `contributions/`). */
export async function hasContributions(dir: string): Promise<boolean> {
  const root = layout(dir).allContributions;
  if (!existsSync(root)) return false;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // oxlint-disable-next-line no-await-in-loop -- a few directories
    if ((await readdir(join(root, entry.name))).length > 0) return true;
  }
  return false;
}

/** A transcript on disk plus its chain root. Appends are validated and persisted immediately. */
export interface TranscriptStore {
  transcript: Transcript;
  genesis: string;
  append<R extends TranscriptRecord>(record: R): Promise<Chained<R>>;
  save(): Promise<void>;
}

/**
 * Opens (or starts) a ceremony's transcript, rooted in its announcement. Refuses a transcript
 * anchored elsewhere, for another ceremony, or whose chain does not verify; and refuses to start a
 * new one over contributions already on disk (a lost transcript would otherwise overwrite them).
 */
export async function openTranscript(
  dir: string,
  announcement: Loaded<CeremonyAnnouncement>,
): Promise<TranscriptStore> {
  const paths = layout(dir);
  const path = paths.transcript;
  const id = announcement.value.ceremony_id;
  const genesis = chainGenesis(id, announcement.value);
  if (!existsSync(path) && (await hasContributions(dir))) {
    throw new Error("transcript.json is missing but contributions are on disk");
  }
  const transcript: Transcript = existsSync(path)
    ? (await loadTranscript(dir)).value
    : transcriptOf(id, announcement.sha256, []);

  const anchor = checkAnchor(transcript, announcement.value, announcement.sha256);
  if (anchor.length > 0) throw new Error(`transcript: ${anchor.join("; ")}`);
  const check = verifyChain(transcript.records, genesis);
  if (!check.ok) throw new Error(`transcript chain broken at record ${check.position}`);

  const save = () => writeJson(path, transcript);
  return {
    transcript,
    genesis,
    save,
    async append(record) {
      const chained = appendRecord(transcript.records, genesis, record);
      transcript.records.push(chained);
      await save();
      return chained;
    },
  };
}
