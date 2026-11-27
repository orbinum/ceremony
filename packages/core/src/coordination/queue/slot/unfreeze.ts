/**
 * Restarts the clock of a claimed session; the heartbeat window starts again too, never earlier
 * than a heartbeat already applied (a result judged at its receipt time may settle late).
 */
import type { Slot } from "../types";

export function unfreeze(slot: Slot, now: number): void {
  if (slot.claimedAt !== null && slot.runningSince === null) {
    slot.runningSince = now;
    slot.lastHeartbeat = Math.max(slot.lastHeartbeat, now);
  }
}
