/**
 * Advances the queue's clock (the alarm, and before applying a result): deadlines that passed take
 * effect. While the clock is held for a promotion, the alarm looks again a second later instead.
 * An object configured for another ceremony than the deployment's (its alarm still fires after the
 * deployment moved on) does nothing and drops its alarm.
 */
import { step } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { commit, isBound, type Store } from "../../store";
import { heldAt } from "./held-at";

const HELD_ALARM_MS = 1000;

export async function tick(store: Store): Promise<void> {
  if (!isBound(store)) {
    await store.storage.deleteAlarm();
    return;
  }
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
