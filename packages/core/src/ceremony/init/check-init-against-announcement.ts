/**
 * `init.json` is the one the announcement pins: byte-for-byte (`initSha256` of the exact file),
 * same ceremony, built from the announced circuits commit.
 */
import type { CeremonyAnnouncement } from "../announcement";
import type { InitRecord } from "./types";

export function checkInitAgainstAnnouncement(
  announcement: CeremonyAnnouncement,
  init: InitRecord,
  initSha256: string,
): string[] {
  const problems: string[] = [];
  if (initSha256 !== announcement.init_sha256) {
    problems.push("init.json is not the one ceremony.json announced");
  }
  if (init.ceremony_id !== announcement.ceremony_id) {
    problems.push("init.json and ceremony.json name different ceremonies");
  }
  if (init.source.commit !== announcement.circuits_source.commit) {
    problems.push("init.json was not built from the announced circuits commit");
  }
  return problems;
}
