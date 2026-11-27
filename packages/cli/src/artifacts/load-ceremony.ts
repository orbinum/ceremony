/**
 * The announcement and the init it pins: the same ceremony, and `init.json` byte-for-byte the one
 * the announcement hashed.
 */
import { checkInitAgainstAnnouncement } from "@orbinum-ceremony/core";
import { loadAnnouncement } from "./load-announcement";
import { loadInit } from "./load-init";

export async function loadCeremony(dir: string) {
  const announcement = await loadAnnouncement(dir);
  const init = await loadInit(dir);
  const problems = checkInitAgainstAnnouncement(announcement.value, init.value, init.sha256);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { announcement, init };
}
