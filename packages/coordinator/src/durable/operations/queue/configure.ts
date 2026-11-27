/**
 * Freezes the setup once and schedules the opening: core parses it, the same setup again is a
 * no-op, any other is refused, and the schedule comes from the announcement.
 */
import {
  circuitsOf,
  initialQueue,
  parseSetup,
  sameSetup,
  scheduleOf,
  type Setup,
  type SetupInput,
} from "@orbinum-ceremony/core";
import * as db from "../../db";
import { commit, type Store } from "../../store";
import { done, refuse } from "../outcome";
import type { Outcome } from "../types";

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
  await commit(store, initialQueue(scheduleOf(setup), circuitsOf(setup.init)), [], undefined, () =>
    db.writeSetup(store.sql, setup),
  );
  return done();
}
