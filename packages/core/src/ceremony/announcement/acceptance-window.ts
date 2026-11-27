/**
 * The span in which a contribution may be accepted (epoch ms): uploads stop at close, but one in
 * verification at that moment may still be accepted within the verify deadline.
 */
import { VERIFY_DEADLINE_MS } from "../../config";
import type { CeremonyAnnouncement } from "./types";

export const acceptanceWindow = (a: CeremonyAnnouncement): { from: number; to: number } => ({
  from: Date.parse(a.schedule.open),
  to: Date.parse(a.schedule.close) + VERIFY_DEADLINE_MS,
});
