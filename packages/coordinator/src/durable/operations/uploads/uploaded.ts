/**
 * The bytes are under `key`: checked again (another upload of this turn may already have taken the
 * job), the job is recorded, the slot's clock freezes, and the job spec to dispatch comes back.
 */
import {
  type CeremonyRefusal,
  isJobObjectKey,
  type JobSpec,
  jobSpecOf,
  newJob,
  type UploadRequest,
} from "@orbinum-ceremony/core";
import * as db from "../../db";
import { commit, type Store } from "../../store";
import { refuse } from "../outcome";
import { checkedUpload } from "./checked-upload";
import { releaseUpload } from "./release-upload";

export async function uploaded(
  store: Store,
  upload: UploadRequest,
  key: string,
): Promise<{ ok: true; spec: JobSpec } | { ok: false; refusal: CeremonyRefusal }> {
  releaseUpload(store, key);
  const c = checkedUpload(store, upload);
  if (!c.ok) return c;
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
