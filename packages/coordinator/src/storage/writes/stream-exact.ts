/**
 * Streams `body` under `key`, refusing anything but exactly `size` bytes hashing to `sha256`, and
 * written only as a new object (`ifAbsent`) or only over the version with `ifEtag`, never over one
 * it did not see. The bytes are counted and hashed beside the write, so a wrong body is
 * `BytesMismatch` (the client's) and a failed write with the right bytes is `StorageError` (ours).
 * A wrong body written anyway is deleted, only while it is still the version this call wrote (R2
 * has no conditional delete). A key already there is `exists` with the same bytes, else `conflict`.
 */
import { toHex } from "@orbinum-ceremony/core";
import { BytesMismatch } from "../bytes-mismatch";
import { holds } from "../holds";
import { headObject } from "../reads";
import { StorageError } from "../storage-error";
import type { Bucket, WriteResult } from "../types";

const conditional = { onlyIf: { etagDoesNotMatch: "*" } } as const;

async function existing(bucket: Bucket, key: string, sha256: string): Promise<WriteResult> {
  return holds(await headObject(bucket, key), sha256) ? "exists" : "conflict";
}

async function deleteIfWritten(bucket: Bucket, key: string, etag: string): Promise<void> {
  try {
    if ((await bucket.head(key))?.etag === etag) await bucket.delete(key);
  } catch (error) {
    console.error("delete:", error);
  }
}

export async function streamExact(
  bucket: Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  expected: {
    size: number;
    sha256: string;
    contentType: string;
    ifAbsent: boolean;
    ifEtag?: string;
  },
): Promise<WriteResult> {
  let bytes = 0;
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
  );
  const [toBucket, toHash] = counted.tee();
  const digest = new crypto.DigestStream("SHA-256");
  const [put, hashed] = await Promise.allSettled([
    bucket.put(key, toBucket.pipeThrough(new FixedLengthStream(expected.size)), {
      sha256: expected.sha256,
      httpMetadata: { contentType: expected.contentType },
      ...(expected.ifAbsent
        ? conditional
        : expected.ifEtag
          ? { onlyIf: { etagMatches: expected.ifEtag } }
          : {}),
    }),
    toHash.pipeTo(digest).then(async () => toHex(await digest.digest)),
  ]);
  const actual = hashed.status === "fulfilled" ? hashed.value : null;
  if (bytes !== expected.size || actual !== expected.sha256) {
    if (put.status === "fulfilled" && put.value) await deleteIfWritten(bucket, key, put.value.etag);
    throw new BytesMismatch(`expected ${expected.size} bytes hashing to the declared SHA-256`);
  }
  if (put.status === "rejected") {
    throw new StorageError(`put ${key}: ${(put.reason as Error).message}`, { cause: put.reason });
  }
  return put.value ? "stored" : existing(bucket, key, expected.sha256);
}
