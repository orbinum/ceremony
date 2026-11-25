/**
 * One commit: a state change and the transcript records it stands for, persisted in the same
 * synchronous write (a restart never leaves one without the other), then the alarm, the stale
 * uploads and the publication. SPEC §4.3, §6.3.
 */
import {
  type BeaconRecord,
  type ContributionRecord,
  isCurrentVerification,
  nextDeadline,
  type QueueEffect,
  type QueueState,
  recordsOfEffects,
} from "@orbinum-ceremony/core";
import { deleteQuietly, privateBucket } from "../../storage";
import * as db from "../db";
import { indexOf, unpublishUnrecorded } from "./copies";
import { publish } from "./publish";
import { append, type Store } from "./store";

/** How soon a publication that failed is tried again (KL-28). */
const PUBLISH_RETRY_MS = 30_000;

/**
 * Persists the state, the records its effects stand for and the jobs it made stale, in one
 * synchronous write; then moves the alarm, drops the stale uploads (and any public copy of theirs
 * the transcript does not record) and publishes. `record` is the contribution of an `accepted`
 * effect, or the sealed beacon of `finalized`. `before` holds the caller's own writes that belong
 * with this state (a job, the finals, an attestation): they land in the same transaction.
 */
export async function commit(
  store: Store,
  state: QueueState,
  effects: QueueEffect[],
  record?: ContributionRecord | BeaconRecord,
  before?: () => void,
): Promise<void> {
  const at = new Date().toISOString();
  // One transaction: a write that fails leaves none of them written.
  try {
    store.storage.transactionSync(() => {
      before?.();
      db.writeQueue(store.sql, state);
      for (const r of recordsOfEffects(store.env.CEREMONY_ID, effects, at, record)) {
        append(store, r);
      }
    });
  } catch (error) {
    store.cache = null;
    throw error;
  }
  // Only the slot's current verification may still get a result.
  const stale = db.pendingJobs(store.sql).filter((job) => !isCurrentVerification(state, job));
  for (const job of stale) db.writeJob(store.sql, { ...job, status: "stale" });
  const next = nextDeadline(state);
  // Armed before publishing, even with no deadline left (a sealed ceremony): an object reset
  // between this commit and its publication still gets the publication retried.
  await store.storage.setAlarm(next ?? Date.now() + PUBLISH_RETRY_MS);
  if (stale.length > 0) {
    await deleteQuietly(
      privateBucket(store.env),
      stale.map((job) => job.key),
    );
    // A result still promoting its copies cleans them up itself.
    for (const job of stale.filter((j) => !store.promoting.has(indexOf(j)))) {
      // oxlint-disable-next-line no-await-in-loop -- one stale job at a time, rarely more
      await unpublishUnrecorded(store, job);
    }
  }
  // A publication that lags is retried by the alarm until it lands. The retry alarm is dropped
  // only by the last publication chained: a later commit's own one still needs it.
  const publication = publish(store);
  if (await publication) {
    await store.storage.setAlarm(Math.min(next ?? Infinity, Date.now() + PUBLISH_RETRY_MS));
  } else if (next === null && store.publishing === publication) {
    await store.storage.deleteAlarm();
  }
}
