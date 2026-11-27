/**
 * One commit: the state, the transcript records its effects stand for (the contribution of an
 * `accepted` effect, or the sealed beacon of `finalized`) and the caller's own writes that belong
 * with it (`before`: a job, the finals, an attestation) land in one synchronous transaction, so a
 * restart never leaves one without the other. Then the jobs it made stale are marked (only the
 * slot's current verification may still get a result), the alarm is armed, the stale uploads and
 * any public copy of theirs the transcript does not record are dropped (a result still promoting
 * its copies cleans them up itself), and the public files are published. The alarm is armed before
 * publishing even with no deadline left, so an object reset in between still retries the
 * publication; a lagging publication is retried every 30 s until it lands, and the retry alarm is
 * dropped only by the last publication chained. An object configured for another ceremony than
 * the deployment's commits nothing.
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
import { append } from "./append";
import { indexOf } from "./index-of";
import { isBound } from "./is-bound";
import { publish } from "./publish";
import type { Store } from "./types";
import { unpublishUnrecorded } from "./unpublish-unrecorded";

const PUBLISH_RETRY_MS = 30_000;

export async function commit(
  store: Store,
  state: QueueState,
  effects: QueueEffect[],
  record?: ContributionRecord | BeaconRecord,
  before?: () => void,
): Promise<void> {
  if (!isBound(store)) throw new Error(`commit refused: not ceremony ${store.env.CEREMONY_ID}`);
  const at = new Date().toISOString();
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
  const stale = db.pendingJobs(store.sql).filter((job) => !isCurrentVerification(state, job));
  for (const job of stale) db.writeJob(store.sql, { ...job, status: "stale" });
  const next = nextDeadline(state);
  await store.storage.setAlarm(next ?? Date.now() + PUBLISH_RETRY_MS);
  if (stale.length > 0) {
    await deleteQuietly(
      privateBucket(store.env),
      stale.map((job) => job.key),
    );
    for (const job of stale.filter((j) => !store.promoting.has(indexOf(j)))) {
      // oxlint-disable-next-line no-await-in-loop
      await unpublishUnrecorded(store, job);
    }
  }
  const publication = publish(store);
  if (await publication) {
    await store.storage.setAlarm(Math.min(next ?? Infinity, Date.now() + PUBLISH_RETRY_MS));
  } else if (next === null && store.publishing === publication) {
    await store.storage.deleteAlarm();
  }
}
