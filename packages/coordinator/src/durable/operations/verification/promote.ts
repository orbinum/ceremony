/**
 * Copies an accepted upload and its log to their public paths, R2 checking both SHA-256s. The index
 * is not recorded yet (its record would be the head this job extends), so whatever it holds is a
 * leftover and is replaced.
 */
import { CEREMONY_LAYOUT, contentTypeOf, type Job } from "@orbinum-ceremony/core";
import { getObject, privateBucket, publicBucket, replaceObject } from "../../../storage";
import { isRecorded, type Store } from "../../store";
import type { Valid } from "../types";

export async function promote(store: Store, job: Job, valid: Valid): Promise<void> {
  if (isRecorded(store, job)) {
    throw new Error(`promote: ${job.circuit} #${job.index} is already recorded`);
  }
  const published = publicBucket(store.env);
  const logKey = CEREMONY_LAYOUT.log(job.circuit, job.index);
  await replaceObject(published, logKey, valid.log, valid.logSha256, contentTypeOf(logKey));
  const object = await getObject(privateBucket(store.env), job.key);
  if (!object) throw new Error(`promote: ${job.key} is missing`);
  const zkeyKey = CEREMONY_LAYOUT.zkey(job.circuit, job.index);
  await replaceObject(
    published,
    zkeyKey,
    object.body,
    job.claim.outputSha256,
    contentTypeOf(zkeyKey),
  );
}
