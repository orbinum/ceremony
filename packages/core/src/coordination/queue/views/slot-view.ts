/** What a contributor sees of their own place: position in line, or their session. */
import { QUEUE_RULES } from "../../../config";
import type { QueueRules, QueueState, SlotCircuit } from "../types";

export function slotView(state: QueueState, githubId: number, rules: QueueRules = QUEUE_RULES) {
  const position = state.queue.findIndex((e) => e.githubId === githubId);
  const slot = state.slot?.githubId === githubId ? state.slot : null;
  return {
    phase: state.phase,
    position: position === -1 ? null : position + 1,
    slot: slot && {
      seq: slot.seq,
      claimed: slot.claimedAt !== null,
      claimBy: slot.claimedAt === null ? slot.grantedAt + rules.claimWindowMs : null,
      circuits: slot.circuits.map(({ circuit, status, attempts }: SlotCircuit) => ({
        circuit,
        status,
        attempts,
      })),
    },
  };
}
