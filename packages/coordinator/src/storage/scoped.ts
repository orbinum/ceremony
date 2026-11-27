/**
 * A bucket seen from one ceremony's folder (`<ceremony_id>/…`): no key it takes can name a file
 * outside it, so a deployment moved to another ceremony never meets the immutable files of an
 * earlier one, which stay published.
 */
import { asCeremonyId } from "@orbinum-ceremony/core";
import type { Bucket } from "./types";

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
