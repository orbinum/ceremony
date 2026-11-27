/**
 * The receipt the queue's clock holds at while results received in time are being promoted (the
 * earliest of those in flight), so a copy's own I/O never turns a timely result into a missed
 * deadline. A promotion holds it for at most a minute; one that takes longer lets deadlines run
 * again.
 */
import type { Store } from "../../store";

const HOLD_MS = 60_000;

export function heldAt(store: Store, now: number): number | null {
  const live = [...store.receivedAt.values()].filter((at) => now - at < HOLD_MS);
  return live.length > 0 ? Math.min(...live) : null;
}
