/**
 * Opens (or starts) the operator's transcript on disk, rooted in the ceremony's announcement, for
 * appending record by record. Refuses a transcript anchored elsewhere, for another ceremony, or
 * whose chain does not verify; and refuses to start a new one over contributions already on disk
 * (a lost transcript would otherwise overwrite them).
 */
import { existsSync } from "node:fs";
import {
  appendRecord,
  type CeremonyAnnouncement,
  chainGenesis,
  checkAnchor,
  type Transcript,
  transcriptOf,
  verifyChain,
} from "@orbinum-ceremony/core";
import { layout, type Loaded, loadTranscript } from "../artifacts";
import { writeJson } from "../io";
import { hasContributions } from "./has-contributions";
import type { TranscriptStore } from "./types";

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
