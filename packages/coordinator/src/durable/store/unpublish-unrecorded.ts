/**
 * Removes the public copies (zkey and log) at a job's index unless the transcript records them: a
 * contribution's files are public only while the transcript records them, so they go when a result
 * that wrote them does not commit, and when its job goes stale. An object configured for another
 * ceremony than the deployment's removes nothing: the folder is not its own.
 */
import { CEREMONY_LAYOUT, type Job } from "@orbinum-ceremony/core";
import { deleteQuietly, publicBucket } from "../../storage";
import { isBound } from "./is-bound";
import { isRecorded } from "./is-recorded";
import type { Store } from "./types";

export async function unpublishUnrecorded(store: Store, job: Job): Promise<void> {
  if (!isBound(store) || isRecorded(store, job)) return;
  await deleteQuietly(publicBucket(store.env), [
    CEREMONY_LAYOUT.zkey(job.circuit, job.index),
    CEREMONY_LAYOUT.log(job.circuit, job.index),
  ]);
}
