/**
 * Simulated contributions only in rehearsals: on mainnet they would be operator-made entropy
 * standing in for contributors.
 */
import { SIMULATED_NETWORKS } from "../../../config";
import type { CeremonyAnnouncement } from "../../announcement";
import type { Chained } from "../types";
import { isSimulated } from "./is-simulated";

export function checkSimulated(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): string[] {
  if (SIMULATED_NETWORKS.includes(announcement.network)) return [];
  return records.flatMap((r) =>
    r.type === "contribution" && isSimulated(r)
      ? [`${r.circuit} #${r.index}: simulated contribution on ${announcement.network}`]
      : [],
  );
}
