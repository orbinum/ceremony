/**
 * Where to stream an upload (a random suffix keeps two uploads apart). One upload streams per job
 * at a time: a second one is refused before its bytes move instead of after they are stored. The
 * hold lasts the declared size at a slow 128 KiB/s plus 2 minutes; every exit releases it sooner,
 * so this only bounds one whose Worker died mid-stream, and its holder can upload again within
 * minutes. Kept in SQLite: an evicted object still sees it.
 */
import {
  type CeremonyRefusal,
  jobKey,
  jobObjectKey,
  type UploadRequest,
} from "@orbinum-ceremony/core";
import { randomHex } from "../../../services";
import * as db from "../../db";
import type { Store } from "../../store";
import { refuse } from "../outcome";
import { checkedUpload } from "./checked-upload";

const streamHoldMs = (size: number) => 2 * 60_000 + Math.ceil(size / (128 * 1024)) * 1000;

const uploadHold = (job: string) => `upload:${job}`;

export function prepareUpload(
  store: Store,
  upload: UploadRequest,
): { ok: true; key: string } | { ok: false; refusal: CeremonyRefusal } {
  const c = checkedUpload(store, upload);
  if (!c.ok) return c;
  const id = uploadHold(jobKey(c.job));
  const now = Date.now();
  if (db.holdLive(store.sql, id, now)) return refuse("busy");
  const key = jobObjectKey(c.job, randomHex(8));
  db.takeHold(store.sql, id, key, now + streamHoldMs(upload.size), now);
  return { ok: true, key };
}
