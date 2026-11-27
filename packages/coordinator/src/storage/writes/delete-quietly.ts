/**
 * Deletes keys, best effort: a failure is only logged (private uploads are also purged by the
 * bucket's lifecycle rule on `verify/`).
 */
import type { Bucket } from "../types";

export async function deleteQuietly(bucket: Bucket, keys: string | string[]): Promise<void> {
  try {
    await bucket.delete(keys);
  } catch (error) {
    console.error("delete:", error);
  }
}
