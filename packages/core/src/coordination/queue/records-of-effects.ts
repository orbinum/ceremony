/**
 * The transcript records a step's effects stand for, in effect order: a `state` record per phase
 * change, the contribution record of the valid upload for an `accepted` effect and the sealed
 * beacon for a `finalized` one, each built and checked before the step. Accepting without the
 * contribution record, or finalizing without the beacon, is a programming error.
 */
import {
  type BeaconRecord,
  buildStateRecord,
  type ContributionRecord,
  type TranscriptRecord,
} from "../../ceremony";
import type { QueueEffect } from "./types";

export function recordsOfEffects(
  ceremonyId: string,
  effects: readonly QueueEffect[],
  at: string,
  record?: ContributionRecord | BeaconRecord,
): TranscriptRecord[] {
  return effects.flatMap((e): TranscriptRecord[] => {
    if (e.type === "state") return [buildStateRecord(ceremonyId, e, at)];
    if (e.type === "accepted") {
      if (record?.type !== "contribution") throw new Error("accepted without its contribution");
      return [record];
    }
    if (e.type === "finalized") {
      if (record?.type !== "beacon") throw new Error("finalized without the sealed beacon");
      return [record];
    }
    return [];
  });
}
