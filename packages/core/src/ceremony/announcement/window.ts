/** When contributions may be made and accepted. SPEC §4.3. */
import { VERIFY_DEADLINE_MS } from "../../config";
import type { CeremonyAnnouncement } from "./types";

/** Where `now` (epoch ms) falls in the contribution window. */
export function windowState(a: CeremonyAnnouncement, now: number): "before" | "open" | "closed" {
  if (now < Date.parse(a.schedule.open)) return "before";
  return now < Date.parse(a.schedule.close) ? "open" : "closed";
}

/**
 * The span in which a contribution may be accepted (epoch ms): uploads stop at close, but one in
 * verification at that moment may still be accepted within the verify deadline.
 */
export const acceptanceWindow = (a: CeremonyAnnouncement): { from: number; to: number } => ({
  from: Date.parse(a.schedule.open),
  to: Date.parse(a.schedule.close) + VERIFY_DEADLINE_MS,
});
