/**
 * The buckets as the Worker sees them: this test environment's ceremony folder, with `list` too
 * (keys relative to the folder), so tests read and plant files where the code under test does.
 */
import { env } from "cloudflare:workers";
import { scoped } from "../../src/storage";

export const FOLDER = `${env.CEREMONY_ID}/`;

export const inFolder = (key: unknown): unknown =>
  typeof key === "string" && key.startsWith(FOLDER)
    ? key.slice(FOLDER.length)
    : Array.isArray(key)
      ? key.map(inFolder)
      : key;

function folderOf(bucket: R2Bucket) {
  return {
    ...scoped(bucket, env.CEREMONY_ID),
    async list(options: R2ListOptions = {}) {
      const listed = await bucket.list({ ...options, prefix: FOLDER + (options.prefix ?? "") });
      const keys = listed.objects.map((o) => ({ key: o.key.slice(FOLDER.length), size: o.size }));
      return { truncated: listed.truncated, objects: keys };
    },
  };
}

export const PUBLIC = folderOf(env.PUBLIC);

export const PRIVATE = folderOf(env.PRIVATE);
