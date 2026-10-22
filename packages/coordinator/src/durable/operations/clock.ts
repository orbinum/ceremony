/**
 * The queue's clock: deadlines that passed take effect (the alarm, and before applying an event or
 * a result). While a result received in time is being promoted, the clock holds at its receipt,
 * so the copy's own I/O never turns a timely result into a missed deadline. SPEC §4.2.
 */
import { step } from "@orbinum-ceremony/core";
import * as db from "../db";
import { commit, type Store } from "../store";

/** Longest a promotion holds the clock: a copy that takes longer lets deadlines run again. */
const HOLD_MS = 60_000;
/** How soon the alarm looks again while the clock is held. */
const HELD_ALARM_MS = 1000;

/** The receipt the clock holds at, if a promotion holds it now. */
function heldAt(store: Store, now: number): number | null {
  const at = store.receivedAt;
  return at !== null && now - at < HOLD_MS ? at : null;
}

/** The time queue events are applied at. */
export function queueNow(store: Store): number {
  const now = Date.now();
  return heldAt(store, now) ?? now;
}

/** Advances the clock: deadlines that passed take effect (later, while the clock is held). */
export async function tick(store: Store): Promise<void> {
  const state = db.readQueue(store.sql);
  if (!state) return;
  const now = Date.now();
  if (heldAt(store, now) !== null) {
    await store.storage.setAlarm(now + HELD_ALARM_MS);
    return;
  }
  const r = step(state, { type: "tick" }, now);
  if (r.ok) await commit(store, r.state, r.effects);
}
