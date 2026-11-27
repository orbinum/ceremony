/** The time queue events are applied at: now, or the receipt the clock holds at. */
import type { Store } from "../../store";
import { heldAt } from "./held-at";

export function queueNow(store: Store): number {
  const now = Date.now();
  return heldAt(store, now) ?? now;
}
