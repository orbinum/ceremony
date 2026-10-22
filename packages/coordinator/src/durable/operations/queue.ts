/**
 * Queue events from contributors and operators (SPEC §4.1–4.3): core decides which a caller may
 * send and what each does; uploads, results and finalization have their own operations. An event
 * that changes nothing writes nothing.
 */
import { canonicalJson, clientEventRefusal, type QueueEvent, step } from "@orbinum-ceremony/core";
import * as db from "../db";
import { commit, type Store } from "../store";
import { queueNow } from "./clock";
import { done, type Outcome, refuse } from "./outcome";

/** Applies one queue event. */
export async function apply(store: Store, event: QueueEvent): Promise<Outcome> {
  const linked = "githubId" in event && db.readIdentity(store.sql, event.githubId) !== null;
  const why = clientEventRefusal(event, linked);
  if (why === "invalid-transition") return refuse(why);
  const state = db.readQueue(store.sql);
  if (!state) return refuse("not-configured");
  if (why) return refuse(why);
  const r = step(state, event, queueNow(store));
  if (!r.ok) return refuse(r.refusal);
  if (r.effects.length === 0 && canonicalJson(r.state) === canonicalJson(state)) return done();
  await commit(store, r.state, r.effects);
  return done(r.effects);
}
