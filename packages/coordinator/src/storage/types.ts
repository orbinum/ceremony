/**
 * Types the storage calls share: the calls the ceremony makes on a bucket, with keys relative to
 * one ceremony's folder, and how a write ended (`conflict`: the key holds other bytes, and
 * published files never change).
 */
export type Bucket = Pick<R2Bucket, "head" | "get" | "put" | "delete">;

export type WriteResult = "stored" | "exists" | "conflict";
