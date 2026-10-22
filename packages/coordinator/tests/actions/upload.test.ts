/**
 * Receiving an upload (SPEC §2.5): a failed bucket is `storage`, other bytes are `malformed`, a
 * turn that ended meanwhile is refused, and the private object never survives a refusal.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { receiveUpload } from "../../src/actions";
import {
  claimOf,
  freshId,
  GENESIS_SHA256,
  linkDirect,
  routedTo,
  setupInput,
  stubOf,
} from "../support";

/** Bindings of a fresh ceremony (its own object), with buckets optionally wrapped. */
const envOf = (): Env & { name: string } => {
  const name = freshId("actions-upload");
  return { ...env, ...routedTo(name), name } as Env & { name: string };
};

/** A bucket whose `method` runs `hook` first (to fail it, or to change state meanwhile). */
function hooked(bucket: R2Bucket, method: string, hook: () => Promise<void> | void): R2Bucket {
  return new Proxy(bucket, {
    get(target, prop) {
      const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        if (prop === method) await hook();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

const BYTES = new TextEncoder().encode("an upload");
const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });

/** A ceremony whose identity 1 holds a claimed slot. */
async function inSession(e: { name: string }) {
  const stub = stubOf(e.name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  return stub;
}
const upload = (bytes = BYTES) => ({
  githubId: 1,
  via: "dev" as const,
  circuit: "shield" as const,
  claim: claimOf(BYTES, GENESIS_SHA256.shield),
  size: BYTES.length,
  body: stream(bytes),
});
const privateKeys = async () =>
  (await env.PRIVATE.list({ prefix: "verify/" })).objects.map((o) => o.key);

describe("receiveUpload", () => {
  it("answers storage when the bucket fails, and keeps nothing", async () => {
    const e = envOf();
    const stub = await inSession(e);
    const broken = {
      ...e,
      PRIVATE: hooked(e.PRIVATE, "put", () => Promise.reject(new Error("R2 down"))),
    };
    const before = await privateKeys();
    expect(await receiveUpload(broken, upload(), () => undefined)).toMatchObject({
      ok: false,
      code: "storage",
    });
    expect(await privateKeys()).toEqual(before);
    expect(await stub.latestJob(1, "shield")).toBeNull();
  });

  it("refuses other bytes than the claim, and keeps nothing", async () => {
    const e = envOf();
    const stub = await inSession(e);
    const before = await privateKeys();
    const other = upload(new TextEncoder().encode("other bytes"));
    expect(await receiveUpload(e, other, () => undefined)).toMatchObject({
      ok: false,
      code: "malformed",
    });
    expect(await privateKeys()).toEqual(before);
    expect(await stub.latestJob(1, "shield")).toBeNull();
  });

  it("removes the stored upload when the turn ended while it was streaming", async () => {
    const e = envOf();
    const stub = await inSession(e);
    const ending = {
      ...e,
      PRIVATE: hooked(
        e.PRIVATE,
        "put",
        async () => void (await stub.apply({ type: "finish", githubId: 1 })),
      ),
    };
    const before = await privateKeys();
    expect(await receiveUpload(ending, upload(), () => undefined)).toMatchObject({
      ok: false,
      code: "not-your-slot",
    });
    expect(await privateKeys()).toEqual(before);
  });

  it("queues an accepted upload's dispatch and answers 202 with the job", async () => {
    const e = envOf();
    await inSession(e);
    const later: Promise<unknown>[] = [];
    const r = await receiveUpload(e, upload(), (p) => later.push(p));
    expect(r).toMatchObject({
      ok: true,
      status: 202,
      value: { job: { seq: 1, circuit: "shield", attempt: 1, index: 1 } },
    });
    expect(later).toHaveLength(1);
  });
});
