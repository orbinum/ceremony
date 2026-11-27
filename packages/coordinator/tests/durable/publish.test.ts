/**
 * Publishing `transcript.json` and `status.json`: in order (a held publication delays the next),
 * only when changed (an event that changes nothing queues none), withheld when the transcript fails
 * its checks, and retried by the alarm until a write that failed lands.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { type Chained, verifyChain } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred, linkDirect, PUBLIC, setupInput, unwrapBuckets, wrapBucket } from "../support";

let n = 0;
const fresh = () => env.CEREMONY.getByName(`publish-test-${++n}-${Date.now()}`);
type Stub = ReturnType<typeof fresh>;

async function opened(): Promise<Stub> {
  const stub = fresh();
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  return stub;
}
const published = async () => {
  const t = await PUBLIC.get("transcript.json");
  return t ? (JSON.parse(await t.text()) as { records: Chained[] }) : null;
};
const puts = (stub: Stub, keys: string[]) =>
  wrapBucket(stub, "PUBLIC", (method, key) => {
    if (method === "put") keys.push(String(key));
  });

afterEach(() => vi.restoreAllMocks());

const alarmOf = (stub: Stub) => runInDurableObject(stub, (_, state) => state.storage.getAlarm());

describe("publishing transcript.json and status.json", () => {
  it("keeps an alarm armed while a publication lags, and lands it then", async () => {
    const stub = await opened();
    await wrapBucket(stub, "PUBLIC", (method, key) => {
      if (method === "put" && key === "transcript.json") throw new Error("R2 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await stub.applyOperator({ type: "pause" });
    await unwrapBuckets(stub);
    expect(await alarmOf(stub)).toBeLessThanOrEqual(Date.now() + 30_000);
    expect((await published())?.records.map((r) => (r as { to?: string }).to)).toEqual(["OPEN"]);
    await runDurableObjectAlarm(stub);
    expect((await published())?.records.map((r) => (r as { to?: string }).to)).toEqual([
      "OPEN",
      "PAUSED",
    ]);
    expect((await alarmOf(stub)) ?? Infinity).toBeGreaterThan(Date.now() + 30_000);
  });

  it("retries a failed write at the next commit, with the whole content", async () => {
    const stub = await opened();
    await wrapBucket(stub, "PUBLIC", (method, key) => {
      if (method === "put" && key === "transcript.json") throw new Error("R2 down");
    });
    await stub.applyOperator({ type: "pause" });
    await unwrapBuckets(stub);
    expect((await published())?.records.map((r) => (r as { to?: string }).to)).toEqual(["OPEN"]);
    await stub.applyOperator({ type: "resume" });
    expect((await published())?.records.map((r) => (r as { to?: string }).to)).toEqual([
      "OPEN",
      "PAUSED",
      "OPEN",
    ]);
  });

  it("withholds a transcript that fails its checks, and the ceremony goes on", async () => {
    const stub = await opened();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const before = await published();
    await runInDurableObject(stub, (instance, state) => {
      state.storage.sql.exec(
        "UPDATE records SET json = json_set(json, '$.reason', 'tampered') WHERE n = 1",
      );
      (instance as unknown as { store: { cache: null } }).store.cache = null;
    });
    expect(await stub.applyOperator({ type: "pause" })).toMatchObject({ ok: true });
    expect(await published()).toEqual(before);
    expect(errors.mock.calls.some((c) => String(c[0]).includes("transcript.json withheld"))).toBe(
      true,
    );
    const status = JSON.parse(await (await PUBLIC.get("status.json"))!.text());
    expect(status.phase).toBe("PAUSED");
    const t = (await stub.transcript())!;
    expect(verifyChain(t.records, t.chainGenesis).ok).toBe(false);
  });

  it("does no work for an event that changes nothing", async () => {
    const stub = await opened();
    const keys: string[] = [];
    await puts(stub, keys);
    type Store = { publishing: Promise<void> };
    const marker = Promise.resolve();
    const storeOf = (instance: unknown) => (instance as { store: Store }).store;
    await runInDurableObject(stub, (instance) => {
      storeOf(instance).publishing = marker;
    });
    expect(await stub.apply({ type: "leave", githubId: 1 })).toEqual({ ok: true, effects: [] });
    expect(
      await runInDurableObject(stub, (instance) => storeOf(instance).publishing === marker),
    ).toBe(true);
    await unwrapBuckets(stub);
    expect(keys).toEqual([]);
  });

  it("never lets an older publication land after a newer one", async () => {
    const stub = await opened();
    const writes: string[] = [];
    const held = deferred();
    await wrapBucket(stub, "PUBLIC", async (method, key) => {
      if (method !== "put" || key !== "transcript.json") return;
      writes.push(writes.length === 0 ? "first" : "second");
      if (writes.length === 1) await held.promise;
    });
    const first = stub.applyOperator({ type: "pause" });
    await vi.waitFor(() => expect(writes).toEqual(["first"]));
    const second = stub.applyOperator({ type: "resume" });
    await new Promise((r) => setTimeout(r, 20));
    expect(writes).toEqual(["first"]);
    held.release();
    await Promise.all([first, second]);
    await unwrapBuckets(stub);
    expect(writes).toEqual(["first", "second"]);
    const last = (await published())?.records.at(-1) as { to?: string } | undefined;
    expect(last?.to).toBe("OPEN");
    expect((await published())?.records).toHaveLength(3);
  });
});
