/** A file of this ceremony's public folder, if it exists: no body if the reader's ETag is current. */
import { getObjectIfChanged, publicBucket } from "../../storage";

export const publicArtifact = (env: Env, key: string, ifNoneMatch?: string) =>
  getObjectIfChanged(publicBucket(env), key, ifNoneMatch);
