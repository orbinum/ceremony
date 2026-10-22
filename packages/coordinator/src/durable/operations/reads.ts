/** What the object answers without changing anything: state, setup, transcript, links, jobs. */
import {
  type Chained,
  type CircuitName,
  headOfSetup,
  type Job,
  type JobId,
  type LinkedIdentity,
  type QueueState,
  type Receipt,
  receiptOf,
  type Setup,
  transcriptOf,
} from "@orbinum-ceremony/core";
import * as db from "../db";
import { records, type Store } from "../store";

/** The queue state (null before `configure`). */
export const snapshot = (store: Store): QueueState | null => db.readQueue(store.sql);

/** The setup the ceremony runs (null before `configure`). */
export const setupOf = (store: Store): Setup | null => db.readSetup(store.sql);

/** The final records sealed at the handover (none before it). */
export const finals = (store: Store) => db.readFinals(store.sql);

/** The transcript so far and the chain it starts from. */
export function transcript(store: Store): { chainGenesis: string; records: Chained[] } | null {
  const setup = db.readSetup(store.sql);
  return setup && { chainGenesis: setup.chainGenesis, records: records(store) };
}

/** A session's receipt: its records, each with its chain value, and the anchor. */
export function receipt(store: Store, seq: number): Receipt | null {
  const setup = db.readSetup(store.sql);
  if (!setup) return null;
  const { ceremony_id: id } = setup.announcement;
  return receiptOf(transcriptOf(id, setup.announcementSha256, records(store)), seq);
}

/** The head of a circuit: what the next contribution must extend (SPEC §2.5). */
export function head(
  store: Store,
  circuit: CircuitName,
): { index: number; outputSha256: string } | null {
  const setup = db.readSetup(store.sql);
  const h = setup && headOfSetup(setup, records(store), circuit);
  return h && { index: h.index, outputSha256: h.outputSha256 };
}

/** The wallet linked to this identity, if any. */
export const linked = (store: Store, githubId: number): LinkedIdentity | null =>
  db.readIdentity(store.sql, githubId);

/** A job still waiting for its result; the verifier may read only these objects. */
export function pendingJob(store: Store, id: JobId): Job | null {
  const job = db.readJob(store.sql, id);
  return job?.status === "pending" ? job : null;
}

/** The caller's latest upload of a circuit and what became of it. */
export const latestJob = (store: Store, githubId: number, circuit: CircuitName): Job | null =>
  db.latestJob(store.sql, githubId, circuit);
