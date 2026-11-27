/** A ceremony's queue over its circuits (in session order) before it opens; times in epoch ms. */
import type { CircuitName } from "../../config";
import type { QueueState } from "./types";

export function initialQueue(
  schedule: { openAt: number; closeAt: number },
  circuits: readonly CircuitName[],
): QueueState {
  return {
    phase: "SCHEDULED",
    pausedBy: null,
    schedule,
    circuits: [...circuits],
    queue: [],
    identities: {},
    slot: null,
    nextSeq: 1,
  };
}
