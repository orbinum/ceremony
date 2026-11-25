/**
 * R2 calls the ceremony relies on: every failure of the bucket is a `StorageError` (told apart
 * from bytes that were wrong), uploads are exactly the declared bytes (length and SHA-256), and a
 * write never lands over one it did not see. SPEC §2.5, §6.1.
 */
import { toHex } from "@orbinum-ceremony/core";
import type { Bucket } from "./buckets";

/** The bucket failed (not the bytes): the caller answers `storage`, and may retry. */
export class StorageError extends Error {
  override readonly name = "StorageError";
}

/** How a write ended. `conflict`: the key holds other bytes (published files never change). */
export type WriteResult = "stored" | "exists" | "conflict";

const conditional = { onlyIf: { etagDoesNotMatch: "*" } } as const;

/** Runs one bucket call; whatever it throws becomes a `StorageError`. */
async function guarded<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new StorageError(`${what}: ${(error as Error).message}`, { cause: error });
  }
}

/** An object's metadata, or null. */
export const headObject = (bucket: Bucket, key: string) =>
  guarded(`head ${key}`, () => bucket.head(key));

/** An object with its body, or null. */
export const getObject = (bucket: Bucket, key: string) =>
  guarded(`get ${key}`, () => bucket.get(key));

/**
 * Reads an object unless `ifNoneMatch` (a request's `If-None-Match`) already names its ETag: then
 * its metadata only, no body. No other precondition is taken from the request.
 */
export const getObjectIfChanged = (bucket: Bucket, key: string, ifNoneMatch?: string) =>
  guarded(`get ${key}`, () =>
    bucket.get(key, ifNoneMatch ? { onlyIf: new Headers({ "if-none-match": ifNoneMatch }) } : {}),
  );

/** Writes an object; null when an `onlyIf` condition did not hold. */
export const putObject = (
  bucket: Bucket,
  key: string,
  value: ReadableStream | string,
  options: R2PutOptions,
) => guarded(`put ${key}`, () => bucket.put(key, value, options));

/** Whether an object holds exactly the bytes of `sha256`. */
export const holds = (object: R2Object | null, sha256: string): boolean =>
  !!object?.checksums.sha256 && toHex(object.checksums.sha256) === sha256;

/** The key already exists: the same bytes are a no-op, any others a conflict. */
async function existing(bucket: Bucket, key: string, sha256: string): Promise<WriteResult> {
  return holds(await headObject(bucket, key), sha256) ? "exists" : "conflict";
}

/**
 * Writes `value` under `key` where the caller is the authority over the key (a public copy at an
 * index the transcript does not record): whatever it holds is a leftover and is replaced, unless it
 * is these bytes already. The write is conditional on what was read, so a write that landed
 * meanwhile is never overwritten; that is a `StorageError`, and the caller retries.
 */
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

/** A streamed body that is not exactly the declared bytes. */
export class BytesMismatch extends Error {
  override readonly name = "BytesMismatch";
}

/**
 * Streams `body` under `key`, refusing anything but exactly `size` bytes hashing to `sha256`. The
 * bytes are counted and hashed beside the write, so a wrong body is `BytesMismatch` (the
 * client's) and a failed write with the right bytes is `StorageError` (ours). A wrong body
 * written anyway is deleted, only while it is still the version this call wrote.
 */
export async function streamExact(
  bucket: Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  expected: {
    size: number;
    sha256: string;
    contentType: string;
    /** Write only a new object, or only over the version with this etag. */
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

/** Deletes `key` only if it is still the version `etag` names (R2 has no conditional delete). */
async function deleteIfWritten(bucket: Bucket, key: string, etag: string): Promise<void> {
  try {
    if ((await bucket.head(key))?.etag === etag) await bucket.delete(key);
  } catch (error) {
    console.error("delete:", error);
  }
}

/**
 * Deletes keys, best effort: a failure is logged (private uploads are also purged by the
 * lifecycle rule on `verify/`).
 */
export async function deleteQuietly(bucket: Bucket, keys: string | string[]): Promise<void> {
  try {
    await bucket.delete(keys);
  } catch (error) {
    console.error("delete:", error);
  }
}
