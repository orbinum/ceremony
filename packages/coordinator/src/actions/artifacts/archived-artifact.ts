/**
 * A public file of a ceremony this network announced (its folder holds `ceremony.json`), or of the
 * current one (which `/artifacts` already serves), read like a public artifact: no body if the
 * reader's ETag is current. Any other folder answers as a missing file, so a ceremony's name stays
 * private until its announcement.
 */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { archivedBucket, getObjectIfChanged, headObject } from "../../storage";

export async function archivedArtifact(
  env: Env,
  ceremonyId: string,
  key: string,
  ifNoneMatch?: string,
) {
  const bucket = archivedBucket(env, ceremonyId);
  if (ceremonyId !== env.CEREMONY_ID && !(await headObject(bucket, CEREMONY_LAYOUT.announcement))) {
    return null;
  }
  return getObjectIfChanged(bucket, key, ifNoneMatch);
}
