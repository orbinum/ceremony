/**
 * The private upload of a job still waiting for its result: the verifier may read only these
 * objects.
 */
import type { JobId } from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { getObject, privateBucket } from "../../storage";

export async function pendingUpload(env: Env, id: JobId) {
  const job = await ceremony(env).pendingJob(id);
  return job && getObject(privateBucket(env), job.key);
}
