/** Whether an announced ceremony is closed: only invited accounts may join. */
import type { CeremonyAnnouncement } from "./types";

export const isClosed = (a: CeremonyAnnouncement): boolean => a.admission?.mode === "closed";
