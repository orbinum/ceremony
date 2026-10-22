/**
 * The frozen setup (SPEC §6.1–6.2): core parses it; the same setup again is a no-op, any other is
 * refused; the schedule comes from the announcement.
 */
import {
  initialQueue,
  parseSetup,
  sameSetup,
  scheduleOf,
  type Setup,
  type SetupInput,
} from "@orbinum-ceremony/core";
import * as db from "../db";
import { commit, type Store } from "../store";
import { done, type Outcome, refuse } from "./outcome";

/** Freezes the setup once, and schedules the opening. */
export async function configure(store: Store, input: SetupInput): Promise<Outcome> {
  let setup: Setup;
  try {
    setup = parseSetup(input, store.env.CEREMONY_ID);
  } catch (error) {
    console.error(error);
    return refuse("malformed-setup");
  }
  const current = db.readSetup(store.sql);
  if (current) return sameSetup(current, setup) ? done() : refuse("already-configured");
  await commit(store, initialQueue(scheduleOf(setup)), [], undefined, () =>
    db.writeSetup(store.sql, setup),
  );
  return done();
}
