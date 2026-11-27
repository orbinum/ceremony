/**
 * Writes `value` under `key` where the caller is the authority over the key (a public copy at an
 * index the transcript does not record): whatever it holds is a leftover and is replaced, unless it
 * is these bytes already. The write is conditional on what was read, so a write that landed
 * meanwhile is never overwritten; that is a `StorageError`, and the caller retries.
 */
import { holds } from "../holds";
import { headObject } from "../reads";
import { StorageError } from "../storage-error";
import type { Bucket } from "../types";
import { putObject } from "./put-object";

export async function replaceObject(
  bucket: Bucket,
  key: string,
  value: ReadableStream | string,
  sha256: string,
  contentType: string,
): Promise<"stored" | "exists"> {
  const current = await headObject(bucket, key);
  if (holds(current, sha256)) {
    if (typeof value !== "string") await value.cancel();
    return "exists";
  }
  const put = await putObject(bucket, key, value, {
    sha256,
    httpMetadata: { contentType },
    onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
  });
  if (!put) throw new StorageError(`put ${key}: written by someone else meanwhile`);
  return "stored";
}
