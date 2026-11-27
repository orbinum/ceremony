/**
 * Holds on final-file writes: finalization waits while any is live, so the sealed record and the
 * bucket never disagree. Each write holds on its own, taken before the write is judged, so a seal
 * that wins sees no hold and the write is then judged as FINALIZED. A hold lapses after 15 minutes
 * (every exit releases it sooner) and is kept in SQLite, so an evicted object still sees it.
 */
import * as db from "../../db";
import type { Store } from "../../store";

const FINAL_WRITE_HOLD_MS = 15 * 60_000;

const FINAL_HOLD = "final:";

export function holdFinalWrite(store: Store): string {
  const hold = crypto.randomUUID();
  const now = Date.now();
  db.takeHold(store.sql, `${FINAL_HOLD}${hold}`, "", now + FINAL_WRITE_HOLD_MS, now);
  return hold;
}

export function releaseFinalWrite(store: Store, hold: string): void {
  db.releaseHold(store.sql, `${FINAL_HOLD}${hold}`);
}

export const writingFinals = (store: Store) => db.anyHoldLive(store.sql, FINAL_HOLD, Date.now());
