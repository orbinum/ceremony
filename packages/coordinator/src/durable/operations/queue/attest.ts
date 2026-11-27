/**
 * Records the signed end of a session, whose signature the Worker verified against the linked
 * wallet: core ends the session if it is still open (and refuses a sealed ceremony), and checks the
 * payload covers exactly the session's accepted records, once. The beacon-time cut-off is judged
 * at the real time, never at a clock held for a promotion.
 */
import {
  type AttestationPayload,
  attestStep,
  buildAttestationRecord,
  checkAttestation,
} from "@orbinum-ceremony/core";
import * as db from "../../db";
import { append, commit, records, type Store } from "../../store";
import { queueNow } from "../clock";
import { done, refuse } from "../outcome";
import type { Outcome } from "../types";

export async function attest(
  store: Store,
  githubId: number,
  payload: AttestationPayload,
  signature: string,
): Promise<Outcome> {
  const identity = db.readIdentity(store.sql, githubId);
  if (!identity) return refuse("not-linked");
  const state = db.readQueue(store.sql);
  const setup = db.readSetup(store.sql);
  if (!state || !setup) return refuse("not-configured");
  const closesAt = Date.parse(setup.announcement.schedule.beacon);
  const result = attestStep(state, githubId, payload.seq, queueNow(store), closesAt, Date.now());
  if (!result.ok) return refuse(result.refusal);
  const why = checkAttestation(
    payload,
    { ceremonyId: store.env.CEREMONY_ID, githubId, account: identity.account },
    records(store),
  );
  if (why) return refuse(why);
  await commit(store, result.state, result.effects, undefined, () =>
    append(store, buildAttestationRecord(payload, identity.scheme, signature)),
  );
  return done(result.effects);
}
