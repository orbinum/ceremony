/** Writes an object; null when an `onlyIf` condition did not hold, a `StorageError` on failure. */
import { guarded } from "../guarded";
import type { Bucket } from "../types";

export const putObject = (
  bucket: Bucket,
  key: string,
  value: ReadableStream | string,
  options: R2PutOptions,
) => guarded(`put ${key}`, () => bucket.put(key, value, options));
