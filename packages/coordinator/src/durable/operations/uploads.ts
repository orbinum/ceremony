/**
 * Uploads (SPEC §2.5): core's `checkUpload` decides before the bytes move and again once they are
 * stored (the turn may have moved on meanwhile); then the slot's clock freezes and the job waits
 * for the verifier.
 */
import {
  type CeremonyRefusal,
  checkUpload,
  isJobObjectKey,
  jobKey,
  jobObjectKey,
  type JobSpec,
  jobSpecOf,
  newJob,
  type UploadRequest,
} from "@orbinum-ceremony/core";
import { randomHex } from "../../services";
import * as db from "../db";
import { commit, records, type Store } from "../store";
import { queueNow } from "./clock";
import { refuse } from "./outcome";

const checked = (store: Store, upload: UploadRequest) => {
  const setup = db.readSetup(store.sql);
  const state = db.readQueue(store.sql);
  if (!setup || !state) return refuse("not-configured");
  return checkUpload(setup, state, records(store), upload, queueNow(store));
};

/**
 * How long a started upload holds its job: its declared size at a slow 128 KiB/s, plus 2 minutes.
 * Every exit releases it sooner; this only bounds one whose Worker died mid-stream, so its holder
 * can upload again within minutes. Kept in SQLite: an evicted object still sees it.
 */
const streamHoldMs = (size: number) => 2 * 60_000 + Math.ceil(size / (128 * 1024)) * 1000;

const uploadHold = (job: string) => `upload:${job}`;

/**
 * Where to stream an upload (a random suffix keeps two uploads apart). One upload streams per job
 * at a time: a second one is refused before its bytes move instead of after they are stored.
 */
export function prepareUpload(
  store: Store,
  upload: UploadRequest,
): { ok: true; key: string } | { ok: false; refusal: CeremonyRefusal } {
  const c = checked(store, upload);
  if (!c.ok) return c;
  const id = uploadHold(jobKey(c.job));
  const now = Date.now();
  if (db.holdLive(store.sql, id, now)) return refuse("busy");
  const key = jobObjectKey(c.job, randomHex(8));
  db.takeHold(store.sql, id, key, now + streamHoldMs(upload.size), now);
  return { ok: true, key };
}

/** The upload streaming to `key` ended (stored or not): its job may take another. */
export function releaseUpload(store: Store, key: string): void {
  db.releaseHoldsOn(store.sql, key);
}

/** The bytes are under `key`: record the job, freeze the clock, return what to dispatch. */
export async function uploaded(
  store: Store,
  upload: UploadRequest,
  key: string,
): Promise<{ ok: true; spec: JobSpec } | { ok: false; refusal: CeremonyRefusal }> {
  releaseUpload(store, key);
  const c = checked(store, upload);
  if (!c.ok) return c;
  // Another upload of this turn already took the job.
  if (!isJobObjectKey(c.job, key)) return refuse("busy");
  const job = newJob({
    job: c.job,
    githubId: upload.githubId,
    key,
    size: upload.size,
    claim: upload.claim,
  });
  await commit(store, c.result.state, c.result.effects, undefined, () =>
    db.writeJob(store.sql, job),
  );
  return { ok: true, spec: jobSpecOf(job, c.head, c.genesisSha256) };
}
