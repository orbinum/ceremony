/** Where a moment (epoch ms) falls in an announced contribution window. */
import type { CeremonyAnnouncement } from "./types";

export function windowState(a: CeremonyAnnouncement, now: number): "before" | "open" | "closed" {
  if (now < Date.parse(a.schedule.open)) return "before";
  return now < Date.parse(a.schedule.close) ? "open" : "closed";
}
