/**
 * Loads what `verify` builds on, from private copies: ceremony.json must hash to the pin, announce
 * the expected network and match the verification mode, init.json must be the one it announces,
 * and transcript.json must hash to `--transcript-sha256` when one is given. The summary names the
 * transcript's SHA-256 and each circuit's vk_hash, to compare with the official channel. Then the
 * inputs are staged, and every circuit (or the ptau) that failed to stage is marked as a
 * failed prerequisite. Returns undefined (with the failure reported) when nothing further can be
 * trusted.
 */
import {
  type CeremonyAnnouncement,
  checkInitAgainstAnnouncement,
  checkVerifyMode,
  type InitRecord,
  type Transcript,
} from "@orbinum-ceremony/core";
import {
  layout,
  type Loaded,
  loadAnnouncement,
  loadInit,
  loadTranscript,
} from "../../../artifacts";
import { errorMessage, type Stage } from "../../../io";
import type { Report } from "../../../ui";
import { type Failed, markFailed as markFailedIn, PTAU_PREREQUISITE } from "../gate";
import { stageInputs } from "./stage-inputs";
import type { VerifyContext, VerifyOptions } from "../types";

export async function loadContext(
  options: VerifyOptions,
  report: Report,
  stage: Stage,
): Promise<VerifyContext | undefined> {
  const paths = layout(options.dir);
  const fatal = (id: string, error: unknown) => {
    report.fail(id, errorMessage(error));
    return undefined;
  };

  let announcement: Loaded<CeremonyAnnouncement>;
  try {
    announcement = await loadAnnouncement(
      options.dir,
      await stage.copy(paths.announcement, "ceremony.json"),
    );
  } catch (error) {
    return fatal("ceremony.json is a valid announcement", error);
  }
  if (announcement.sha256 !== options.announcementSha256) {
    report.fail("ceremony.json matches the pinned SHA-256", `found ${announcement.sha256}`);
    return undefined;
  }
  report.pass("ceremony.json matches the pinned SHA-256", announcement.value.ceremony_id);
  const { ceremony_id: id, network, circuits_source: src } = announcement.value;
  report.describe(`ceremony ${id} on ${network}; circuits ${src.repo} ${src.tag} @ ${src.commit}`);
  const expected = network === options.network ? [] : [`${network}, expected ${options.network}`];
  if (!report.expect("ceremony.json announces the expected network", expected, network)) {
    return undefined;
  }

  const mode = checkVerifyMode(announcement.value, options.local);
  if (!report.expect("verification mode matches the announced network", mode)) return undefined;

  let init: Loaded<InitRecord>;
  try {
    init = await loadInit(options.dir, await stage.copy(paths.init, "init.json"));
  } catch (error) {
    return fatal("init.json is valid", error);
  }
  report.expect(
    "init.json is the announced one (bytes, ceremony, circuits commit)",
    checkInitAgainstAnnouncement(announcement.value, init.value, init.sha256),
  );

  let transcript: Transcript;
  let transcriptSha256: string;
  try {
    const loaded = await loadTranscript(
      options.dir,
      await stage.copy(paths.transcript, "transcript.json"),
    );
    transcript = loaded.value;
    transcriptSha256 = loaded.sha256;
  } catch (error) {
    return fatal("transcript.json is valid", error);
  }
  report.describe(`transcript.json SHA-256 ${transcriptSha256}`);
  for (const c of init.value.circuits) {
    const vkHash = transcript.finals.find((f) => f.circuit === c.name)?.vk_hash;
    report.describe(`${c.name} vk_hash ${vkHash ?? "none"}`);
  }
  if (options.transcriptSha256 !== undefined) {
    report.expect(
      "transcript.json matches the pinned SHA-256",
      transcriptSha256 === options.transcriptSha256 ? [] : [`found ${transcriptSha256}`],
    );
  }

  const failed: Failed = new Map();
  const files = await stageInputs(options.dir, options.ptau, init.value, report, stage);
  for (const c of init.value.circuits) {
    if (!files.finalVk.has(c.name))
      markFailedIn(failed, c.name, `${c.name}: inputs are regular files`);
  }
  if (!files.ptau) markFailedIn(failed, PTAU_PREREQUISITE, "ptau is a regular file");
  return { options, report, stage, announcement, init, transcript, files, failed };
}
