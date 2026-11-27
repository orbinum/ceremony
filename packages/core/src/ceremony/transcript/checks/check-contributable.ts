/**
 * Whether a contribution recorded at a given moment would be accepted: inside the announced window
 * and before the beacon is sealed.
 */
import { type CeremonyAnnouncement, windowState } from "../../announcement";
import { sealedBeaconOf } from "../reads";
import type { Chained } from "../types";

export function checkContributable(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
  at: number,
): string[] {
  const { open, close } = announcement.schedule;
  const state = windowState(announcement, at);
  return [
    ...(state === "before" ? [`contributions open at ${open}`] : []),
    ...(state === "closed" ? [`contributions closed at ${close}`] : []),
    ...(sealedBeaconOf(records) ? ["the beacon is sealed: contributions are closed"] : []),
  ];
}
