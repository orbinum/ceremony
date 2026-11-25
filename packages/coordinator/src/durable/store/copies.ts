/**
 * Public copies of uploads: a contribution's zkey and log are public only while the transcript
 * records them. Removed when a result that wrote them does not commit, and when a job goes stale.
 * SPEC §2.5, §6.1.
 */
import { CEREMONY_LAYOUT, contributionsOf, type Job } from "@orbinum-ceremony/core";
import { deleteQuietly, publicBucket } from "../../storage";
import { records, type Store } from "./store";

/** The public index a job writes, as the key of its promotion lock. */
export const indexOf = (job: Job): string => `${job.circuit}/${job.index}`;

/** Whether the transcript records a contribution at `job`'s index. */
export const isRecorded = (store: Store, job: Job): boolean =>
  contributionsOf(records(store), job.circuit).some((r) => r.index === job.index);

/** Removes the public copies at `job`'s index unless the transcript records them. */
export async function unpublishUnrecorded(store: Store, job: Job): Promise<void> {
  if (isRecorded(store, job)) return;
  await deleteQuietly(publicBucket(store.env), [
    CEREMONY_LAYOUT.zkey(job.circuit, job.index),
    CEREMONY_LAYOUT.log(job.circuit, job.index),
  ]);
}
