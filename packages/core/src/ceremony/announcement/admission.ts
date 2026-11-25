/** Who an announcement invites, and whether only they may join. SPEC §3.2. */
import type { CeremonyAnnouncement } from "./types";

/** Whether the announcement invites GitHub account `githubId`. */
export const isInvited = (a: CeremonyAnnouncement, githubId: number): boolean =>
  a.admission?.invited.includes(githubId) === true;

/** Whether only invited accounts may join. */
export const isClosed = (a: CeremonyAnnouncement): boolean => a.admission?.mode === "closed";
