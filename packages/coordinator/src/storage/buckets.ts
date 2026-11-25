/**
 * The Worker's two buckets, one pair per network. Each ceremony keeps its files under its own
 * folder (`<ceremony_id>/…`), so a deployment moved to another ceremony never meets the immutable
 * files of an earlier one, which stay published. Every bucket call goes through here: no other
 * module names `env.PUBLIC` or `env.PRIVATE`. SPEC §6.1.
 */
import { asCeremonyId, CEREMONY_LAYOUT } from "@orbinum-ceremony/core";

/** The calls the ceremony makes on a bucket, with keys relative to one ceremony's folder. */
export type Bucket = Pick<R2Bucket, "head" | "get" | "put" | "delete">;

/** `bucket` seen from `ceremonyId`'s folder: no key it takes can name a file outside it. */
export function scoped(bucket: R2Bucket, ceremonyId: string): Bucket {
  const at = (key: string) => `${asCeremonyId(ceremonyId, "ceremony id")}/${key}`;
  return {
    head: (key) => bucket.head(at(key)),
    get: ((key: string, options?: R2GetOptions) => bucket.get(at(key), options)) as R2Bucket["get"],
    put: ((key: string, value: Parameters<R2Bucket["put"]>[1], options?: R2PutOptions) =>
      bucket.put(at(key), value, options)) as R2Bucket["put"],
    delete: (keys) => bucket.delete(typeof keys === "string" ? at(keys) : keys.map(at)),
  };
}

/** This deployment's ceremony's public files. */
export const publicBucket = (env: Env): Bucket => scoped(env.PUBLIC, env.CEREMONY_ID);

/** This deployment's ceremony's private uploads (waiting for verification). */
export const privateBucket = (env: Env): Bucket => scoped(env.PRIVATE, env.CEREMONY_ID);

/** Any ceremony's public files on this network, this one's included: the archive. */
export const archivedBucket = (env: Env, ceremonyId: string): Bucket =>
  scoped(env.PUBLIC, ceremonyId);

/** Folders listed per call: far above the ceremonies one network runs. */
const MAX_LISTED = 1000;

/**
 * The ceremonies published on this network, in name order: a folder holding its `ceremony.json`
 * (`publish-init` writes it last, so a folder without one was never announced).
 */
export async function archivedCeremonies(env: Env): Promise<string[]> {
  const listed = await env.PUBLIC.list({ delimiter: "/", limit: MAX_LISTED });
  const ids = listed.delimitedPrefixes
    .map((prefix) => prefix.replace(/\/$/, ""))
    .filter((id) => {
      try {
        return asCeremonyId(id, "folder") === id;
      } catch {
        return false;
      }
    });
  const announced = await Promise.all(
    ids.map(
      async (id) => (await archivedBucket(env, id).head(CEREMONY_LAYOUT.announcement)) !== null,
    ),
  );
  return ids.filter((_, i) => announced[i]).toSorted();
}
