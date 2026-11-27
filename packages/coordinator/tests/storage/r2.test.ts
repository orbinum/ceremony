/**
 * R2 calls: every bucket failure is a `StorageError`; exact streamed writes that never land over
 * another object; replacing a leftover only as it was read.
 */
import { env } from "cloudflare:workers";
import { sha256Hex } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BytesMismatch,
  getObject,
  headObject,
  putObject,
  replaceObject,
  StorageError,
  streamExact,
} from "../../src/storage";
import { clearBuckets } from "../support";

const bytes = (s: string) => new TextEncoder().encode(s);
const stream = (b: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(b);
      c.close();
    },
  });
const exact = (b: Uint8Array) => ({
  size: b.length,
  sha256: sha256Hex(b),
  contentType: "application/octet-stream",
  ifAbsent: true,
});
const down = new Proxy({} as R2Bucket, {
  get: () => () => Promise.reject(new Error("R2 down")),
});
const text = async (key: string) => (await env.PUBLIC.get(key))?.text();

beforeEach(clearBuckets);

describe("bucket calls", () => {
  it("turn every failure of the bucket into a StorageError", async () => {
    for (const call of [
      () => headObject(down, "k"),
      () => getObject(down, "k"),
      () => putObject(down, "k", "v", {}),
      () => replaceObject(down, "k", "v", sha256Hex(bytes("v")), "text/plain"),
      () => streamExact(down, "k", stream(bytes("v")), exact(bytes("v"))),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(StorageError);
    }
  });
});

describe("streamExact", () => {
  it("writes exactly the declared bytes once; the same again exists, other bytes conflict", async () => {
    const b = bytes("published");
    expect(await streamExact(env.PUBLIC, "k", stream(b), exact(b))).toBe("stored");
    expect(await streamExact(env.PUBLIC, "k", stream(b), exact(b))).toBe("exists");
    const other = bytes("published, then changed");
    expect(await streamExact(env.PUBLIC, "k", stream(other), exact(other))).toBe("conflict");
    expect(await text("k")).toBe("published");
  });

  it("refuses bytes that are not the declared ones, and keeps none of them", async () => {
    const b = bytes("declared");
    await expect(
      streamExact(env.PUBLIC, "k", stream(bytes("other!!!")), exact(b)),
    ).rejects.toBeInstanceOf(BytesMismatch);
    expect(await env.PUBLIC.head("k")).toBeNull();
  });
});

describe("replaceObject", () => {
  it("writes an absent key, keeps the same bytes, and replaces a leftover", async () => {
    expect(
      await replaceObject(env.PUBLIC, "k", "first", sha256Hex(bytes("first")), "text/plain"),
    ).toBe("stored");
    expect(
      await replaceObject(env.PUBLIC, "k", "first", sha256Hex(bytes("first")), "text/plain"),
    ).toBe("exists");
    expect(
      await replaceObject(env.PUBLIC, "k", "second", sha256Hex(bytes("second")), "text/plain"),
    ).toBe("stored");
    expect(await text("k")).toBe("second");
  });

  it("never lands over a write that happened after it read the key", async () => {
    await env.PUBLIC.put("k", "leftover");
    const racing = new Proxy(env.PUBLIC, {
      get(target, prop) {
        const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
        if (typeof value !== "function") return value;
        if (prop !== "put") return (value as (...a: unknown[]) => unknown).bind(target);
        return async (...args: unknown[]) => {
          await target.put("k", "written meanwhile");
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    await expect(
      replaceObject(racing, "k", "mine", sha256Hex(bytes("mine")), "text/plain"),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await text("k")).toBe("written meanwhile");
  });
});
