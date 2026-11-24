/**
 * Stored objects the routes serve: a public artifact, and a pending job's private upload.
 * SPEC §2.5, §6.1.
 */
import type { JobId } from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { getObject, getObjectIfChanged } from "../storage";

/** A file of the public bucket, if it exists: without its body if the reader's ETag is current. */
export const publicArtifact = (env: Env, key: string, ifNoneMatch?: string) =>
  getObjectIfChanged(env.PUBLIC, key, ifNoneMatch);

/** The private upload of a job still waiting for its result (the verifier may read only these). */
export async function pendingUpload(env: Env, id: JobId) {
  const job = await ceremony(env).pendingJob(id);
  return job && getObject(env.PRIVATE, job.key);
}
