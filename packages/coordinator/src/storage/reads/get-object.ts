/** An object with its body, or null; a bucket failure is a `StorageError`. */
import { guarded } from "../guarded";
import type { Bucket } from "../types";

export const getObject = (bucket: Bucket, key: string) =>
  guarded(`get ${key}`, () => bucket.get(key));
