/**
 * The Worker's two buckets, one pair per network, and the only module that names their bindings,
 * so every bucket call is scoped to a ceremony's folder: this ceremony's public files and private
 * uploads (waiting for verification), any ceremony's public files on this network (the archive),
 * and the ceremonies published there, in name order. A folder counts as published once it holds
 * its `ceremony.json`, which `publish-init` writes last, so a folder without one was never
 * announced; up to 1000 folders are listed, far above what one network runs.
 */
import { asCeremonyId, CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { scoped } from "./scoped";
import type { Bucket } from "./types";

export const publicBucket = (env: Env): Bucket => scoped(env.PUBLIC, env.CEREMONY_ID);

export const privateBucket = (env: Env): Bucket => scoped(env.PRIVATE, env.CEREMONY_ID);

export const archivedBucket = (env: Env, ceremonyId: string): Bucket =>
  scoped(env.PUBLIC, ceremonyId);

const MAX_LISTED = 1000;

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
