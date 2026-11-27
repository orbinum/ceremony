/**
 * A public file of any ceremony this network published (the archive), read like a public artifact:
 * no body if the reader's ETag is current.
 */
import { archivedBucket, getObjectIfChanged } from "../../storage";

export const archivedArtifact = (env: Env, ceremonyId: string, key: string, ifNoneMatch?: string) =>
  getObjectIfChanged(archivedBucket(env, ceremonyId), key, ifNoneMatch);
