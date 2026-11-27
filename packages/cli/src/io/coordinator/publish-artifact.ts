/**
 * Publishes one file at `key` through the operator API, hash-checked by the bucket; the
 * coordinator must answer that it stored that very key. The same bytes again are `unchanged`, so
 * the call is idempotent and retried.
 */
import { ADMIN_PATHS, CONTENT_SHA256_HEADER, sha256Hex } from "@orbinum-ceremony/core";
import { adminCall } from "./admin-call";

export async function publishArtifact(origin: string, key: string, bytes: Uint8Array) {
  const answer = await adminCall(
    origin,
    "PUT",
    ADMIN_PATHS.artifact(key),
    { [CONTENT_SHA256_HEADER]: sha256Hex(bytes) },
    bytes,
  );
  if (answer.key !== key) throw new Error(`PUT ${key}: the coordinator stored another key`);
}
