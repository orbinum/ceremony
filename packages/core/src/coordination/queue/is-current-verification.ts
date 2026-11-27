/** Whether upload `attempt` of `circuit` in session `seq` is the one being verified now. */
import type { CircuitName } from "../../config";
import { verifying } from "./slot";
import type { QueueState } from "./types";

export function isCurrentVerification(
  state: QueueState,
  job: { seq: number; circuit: CircuitName; attempt: number },
): boolean {
  const entry = state.slot && verifying(state.slot);
  return (
    state.slot?.seq === job.seq && entry?.circuit === job.circuit && entry.uploads === job.attempt
  );
}
