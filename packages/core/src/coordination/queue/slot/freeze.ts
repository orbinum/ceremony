/** Stops a session's clock (verifying, paused), banking the active time so far. */
import type { Slot } from "../types";
import { activeMs } from "./active-ms";

export function freeze(slot: Slot, now: number): void {
  slot.activeMs = activeMs(slot, now);
  slot.runningSince = null;
}
