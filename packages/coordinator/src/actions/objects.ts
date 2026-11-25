/**
 * Stored objects the routes serve: a public artifact of this ceremony or of any ceremony this
 * network published (the archive), and a pending job's private upload. SPEC §2.5, §6.1.
 */
import type { JobId } from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import {
  archivedBucket,
  archivedCeremonies,
  getObject,
  getObjectIfChanged,
  privateBucket,
  publicBucket,
} from "../storage";

/** A file of this ceremony's public folder, if it exists: no body if the reader's ETag is current. */
export const publicArtifact = (env: Env, key: string, ifNoneMatch?: string) =>
  getObjectIfChanged(publicBucket(env), key, ifNoneMatch);

/** A public file of any ceremony this network published, read like `publicArtifact`. */
export const archivedArtifact = (env: Env, ceremonyId: string, key: string, ifNoneMatch?: string) =>
  getObjectIfChanged(archivedBucket(env, ceremonyId), key, ifNoneMatch);

/** The ceremonies this network published, current one included. */
export const publishedCeremonies = (env: Env) => archivedCeremonies(env);

/** The private upload of a job still waiting for its result (the verifier may read only these). */
export async function pendingUpload(env: Env, id: JobId) {
  const job = await ceremony(env).pendingJob(id);
  return job && getObject(privateBucket(env), job.key);
}
