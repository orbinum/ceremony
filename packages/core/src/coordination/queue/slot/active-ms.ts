/**
 * A session's active time so far, including the current running stretch. The clock runs only while
 * claimed, open and not verifying; a clock that steps back never takes active time away.
 */
import type { Slot } from "../types";

export function activeMs(slot: Slot, now: number): number {
  return slot.activeMs + (slot.runningSince === null ? 0 : Math.max(0, now - slot.runningSince));
}
