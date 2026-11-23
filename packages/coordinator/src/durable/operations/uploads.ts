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
 * How long a started upload holds its job. Every exit releases it sooner; this only bounds one
 * whose Worker died mid-stream. ponytail: in memory, so an evicted object forgets holds early.
 */
const STREAM_HOLD_MS = 15 * 60_000;

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
  const id = jobKey(c.job);
  const now = Date.now();
  if ((store.streaming.get(id)?.until ?? 0) > now) return refuse("busy");
  const key = jobObjectKey(c.job, randomHex(8));
  store.streaming.set(id, { key, until: now + STREAM_HOLD_MS });
  return { ok: true, key };
}

/** The upload streaming to `key` ended (stored or not): its job may take another. */
export function releaseUpload(store: Store, key: string): void {
  for (const [id, hold] of store.streaming) if (hold.key === key) store.streaming.delete(id);
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
