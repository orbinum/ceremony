/** An object's metadata, or null; a bucket failure is a `StorageError`. */
import { guarded } from "../guarded";
import type { Bucket } from "../types";

export const headObject = (bucket: Bucket, key: string) =>
  guarded(`head ${key}`, () => bucket.head(key));
