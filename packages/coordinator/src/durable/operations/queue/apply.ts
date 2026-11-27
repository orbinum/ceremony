/**
 * Applies one queue event from a contributor or the operator (`by`, fixed by the RPC the caller
 * used): core decides which each may send and what each does; uploads, results and finalization
 * have their own operations. A join takes its invitation from the frozen announcement, never from
 * the caller. An event that changes nothing writes nothing.
 */
import {
  admittedJoin,
  canonicalJson,
  clientEventRefusal,
  type QueueEvent,
  step,
} from "@orbinum-ceremony/core";
import * as db from "../../db";
import { commit, type Store } from "../../store";
import { queueNow } from "../clock";
import { done, refuse } from "../outcome";
import type { Outcome } from "../types";

export async function apply(
  store: Store,
  sent: QueueEvent,
  by: "contributor" | "operator",
): Promise<Outcome> {
  let event = sent;
  if (event.type === "join") {
    const setup = db.readSetup(store.sql);
    if (!setup) return refuse("not-configured");
    const join = admittedJoin(setup.announcement, event.githubId);
    if (!join) return refuse("not-invited");
    event = join;
  }
  const linked = "githubId" in event && db.readIdentity(store.sql, event.githubId) !== null;
  const why = clientEventRefusal(event, linked, by);
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
