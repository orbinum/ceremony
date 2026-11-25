/** The public files after each commit: in order, only when changed. SPEC §6.1, KL-28, KL-31. */
import { publicFilesOf } from "@orbinum-ceremony/core";
import { publicBucket, putObject } from "../../storage";
import * as db from "../db";
import { records, type Store } from "./store";

/**
 * Writes the public files that changed (core `publicFilesOf`, with a sealed ceremony's finals): a
 * transcript that fails its integrity checks is withheld and logged, while `status.json` still
 * goes out (KL-31). Best effort: true when a write failed, so the caller retries; each retry
 * carries the whole content again (KL-28). Publications are chained, so an older one can never
 * land after a newer one.
 */
export function publish(store: Store): Promise<boolean> {
  // Never a rejected chain: one throw would fail every later commit after its state was written.
  const next = store.publishing
    .then(() => publishNow(store))
    .catch((error: unknown) => {
      console.error("publish:", error);
      return true;
    });
  store.publishing = next;
  return next;
}

async function publishNow(store: Store): Promise<boolean> {
  const setup = db.readSetup(store.sql);
  const state = db.readQueue(store.sql);
  if (!setup || !state) return false;
  let lagging = false;
  const files = publicFilesOf(setup, state, records(store), Date.now(), db.readFinals(store.sql));
  for (const f of files) {
    if (db.publishedVersion(store.sql, f.key) === f.version) continue;
    if (!f.body.ok) {
      console.error(`publish ${f.key} withheld: ${f.body.problems.join("; ")}`);
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- two small writes, in order
      await putObject(publicBucket(store.env), f.key, f.body.text, {
        httpMetadata: { contentType: f.contentType, cacheControl: "no-cache" },
      });
      db.setPublishedVersion(store.sql, f.key, f.version);
    } catch (error) {
      console.error(`publish ${f.key}:`, error);
      lagging = true;
    }
  }
  return lagging;
}
