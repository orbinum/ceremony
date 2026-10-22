/** The transcript records a step's effects stand for. SPEC §6.3. */
import {
  type BeaconRecord,
  buildStateRecord,
  type ContributionRecord,
  type TranscriptRecord,
} from "../../ceremony";
import type { QueueEffect } from "./types";

/**
 * In effect order: a `state` record per phase change, `record` for an `accepted` effect (the
 * contribution record of the valid upload) and for a `finalized` one (the sealed beacon), each
 * built and checked before the step. Finalizing without the beacon is a programming error.
 */
export function recordsOfEffects(
  ceremonyId: string,
  effects: readonly QueueEffect[],
  at: string,
  record?: ContributionRecord | BeaconRecord,
): TranscriptRecord[] {
  return effects.flatMap((e): TranscriptRecord[] => {
    if (e.type === "state") return [buildStateRecord(ceremonyId, e, at)];
    if (e.type === "accepted" && record?.type === "contribution") return [record];
    if (e.type === "finalized") {
      if (record?.type !== "beacon") throw new Error("finalized without the sealed beacon");
      return [record];
    }
    return [];
  });
}
