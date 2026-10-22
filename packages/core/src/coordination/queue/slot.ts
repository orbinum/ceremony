/** A session's clock: active time runs only while claimed, open and not verifying. SPEC §4.2. */
import type { Slot, SlotCircuit } from "./types";

/** Active time spent so far, including the current running stretch. */
export function activeMs(slot: Slot, now: number): number {
  // A clock that steps back never takes active time away.
  return slot.activeMs + (slot.runningSince === null ? 0 : Math.max(0, now - slot.runningSince));
}

/** Stops the clock (verifying, paused). */
export function freeze(slot: Slot, now: number): void {
  slot.activeMs = activeMs(slot, now);
  slot.runningSince = null;
}

/**
 * Restarts the clock of a claimed session; the heartbeat window starts again too, never earlier
 * than a heartbeat already applied (a result judged at its receipt time may settle late).
 */
export function unfreeze(slot: Slot, now: number): void {
  if (slot.claimedAt !== null && slot.runningSince === null) {
    slot.runningSince = now;
    slot.lastHeartbeat = Math.max(slot.lastHeartbeat, now);
  }
}

/** The circuit in verification, if any. */
export const verifying = (slot: Slot): SlotCircuit | undefined =>
  slot.circuits.find((c) => c.status === "verifying");
