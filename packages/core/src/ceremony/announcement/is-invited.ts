/** Whether an announcement invites a GitHub account, by numeric id. */
import type { CeremonyAnnouncement } from "./types";

export const isInvited = (a: CeremonyAnnouncement, githubId: number): boolean =>
  a.admission?.invited.includes(githubId) === true;
