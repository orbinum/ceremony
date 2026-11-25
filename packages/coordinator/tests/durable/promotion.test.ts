/**
 * Promoting a valid upload (SPEC §2.5, §6.1): the record is the authority over its public path,
 * so a leftover at an unrecorded index is replaced and never wedges the circuit, a copy the
 * transcript does not record never stays public, a result received in time is judged at receipt,
 * and nothing is recorded outside the acceptance window.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { sha256Hex, toHex, type Setup } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimOf,
  clearBuckets,
  deferred,
  editQueueSql,
  freshId,
  GENESIS_SHA256,
  linkDirect,
  LOG,
  PRIVATE,
  PUBLIC,
  readTranscript,
  setQueue,
  setupInput,
  stubOf,
  unwrapBuckets,
  validReport,
  wrapBucket,
} from "../support";

type Stub = ReturnType<typeof stubOf>;
const ZKEY = "contributions/shield/1.zkey";
const LOG_KEY = "logs/shield/1.log";

/** An open ceremony whose contributor 1 holds a claimed slot. */
async function inSession(): Promise<Stub> {
  const stub = stubOf(freshId("promotion"));
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  return stub;
}

/** Uploads `bytes` as the route does (attempt by attempt); returns the job. */
async function uploadShield(stub: Stub, bytes: Uint8Array) {
  const upload = {
    githubId: 1,
    circuit: "shield" as const,
    claim: claimOf(bytes, GENESIS_SHA256.shield),
    size: bytes.length,
  };
  const prepared = await stub.prepareUpload(upload);
  if (!prepared.ok) throw new Error(prepared.refusal);
  await PRIVATE.put(prepared.key, bytes);
  const r = await stub.uploaded(upload, prepared.key);
  if (!r.ok) throw new Error(r.refusal);
  return r.spec.job;
}

const sha = (s: string | Uint8Array) =>
  sha256Hex(typeof s === "string" ? new TextEncoder().encode(s) : s);
/** The SHA-256 of what a public key holds, or null. */
const holding = async (key: string) => {
  const o = await PUBLIC.head(key);
  return o ? toHex(o.checksums.sha256 ?? new ArrayBuffer(0)) : null;
};
const publicKeys = async () =>
  [
    ...(await PUBLIC.list({ prefix: "contributions/" })).objects,
    ...(await PUBLIC.list({ prefix: "logs/" })).objects,
  ].map((o) => o.key);
const contributions = async (stub: Stub) =>
  (await readTranscript(stub)).records.filter((r) => r.type === "contribution");
const failing = (stub: Stub, key: string) =>
  wrapBucket(stub, "PUBLIC", (method, k) => {
    if (method === "put" && k === key) throw new Error("R2 down");
  });

beforeEach(clearBuckets);

describe("promotion of a valid upload", () => {
  it("leaves no public copy behind when a copy fails, and records nothing", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub, new TextEncoder().encode("a"));
    await failing(stub, ZKEY);
    expect(await stub.report(validReport(job))).toEqual({ ok: false, refusal: "storage" });
    await unwrapBuckets(stub);
    expect(await publicKeys()).toEqual([]);
    expect(await contributions(stub)).toEqual([]);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "pending" });
  });

  it("replaces a leftover at an unrecorded index, and records only the bytes it holds", async () => {
    const stub = await inSession();
    const bytes = new TextEncoder().encode("the contribution");
    const job = await uploadShield(stub, bytes);
    await PUBLIC.put(ZKEY, "someone else's bytes");
    await PUBLIC.put(LOG_KEY, "someone else's log");
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    const [record] = await contributions(stub);
    expect(record).toMatchObject({ index: 1, output_sha256: sha(bytes) });
    expect([await holding(ZKEY), await holding(LOG_KEY)]).toEqual([sha(bytes), sha(LOG)]);
  });

  it("never wedges a circuit: after a copy failing past the deadline, the next upload records", async () => {
    const stub = await inSession();
    const first = await uploadShield(stub, new TextEncoder().encode("first"));
    // The zkey copy fails on every try, and so does the cleanup: the first log stays behind.
    await wrapBucket(stub, "PUBLIC", (method, key) => {
      if (method === "put" && key === ZKEY) throw new Error("R2 down");
      if (method === "delete") throw new Error("R2 down");
    });
    expect(await stub.report(validReport(first, undefined, "first log"))).toEqual({
      ok: false,
      refusal: "storage",
    });
    expect(await holding(LOG_KEY)).toBe(sha("first log"));
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.verifyDeadline = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub);
    await unwrapBuckets(stub);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "stale" });
    expect(await stub.apply({ type: "resume" })).toMatchObject({ ok: true });

    const bytes = new TextEncoder().encode("second");
    const second = await uploadShield(stub, bytes);
    expect(second).toMatchObject({ attempt: 2, index: 1 });
    expect(await stub.report(validReport(second, undefined, "second log"))).toEqual({
      ok: true,
      status: "applied",
    });
    expect(await contributions(stub)).toMatchObject([{ index: 1, output_sha256: sha(bytes) }]);
    expect([await holding(ZKEY), await holding(LOG_KEY)]).toEqual([sha(bytes), sha("second log")]);
    expect((await publicKeys()).toSorted()).toEqual([ZKEY, LOG_KEY]);
  });

  it("removes the public copies of a job that went stale", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub, new TextEncoder().encode("stale"));
    await PUBLIC.put(ZKEY, "a leftover");
    await PUBLIC.put(LOG_KEY, "a leftover log");
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.verifyDeadline = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "stale" });
    expect(await publicKeys()).toEqual([]);
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "stale" });
    expect(await publicKeys()).toEqual([]);
  });

  it("keeps a result received in time though the deadline passes while its copies are made", async () => {
    const stub = await inSession();
    await linkDirect(stub, 2);
    const bytes = new TextEncoder().encode("in time");
    const job = await uploadShield(stub, bytes);
    await wrapBucket(stub, "PUBLIC", async (method, key, sql, object) => {
      if (method !== "put" || key !== ZKEY) return;
      editQueueSql(sql, (s) => {
        if (s.slot) s.slot.verifyDeadline = Date.now() + 5;
      });
      await new Promise((r) => setTimeout(r, 50));
      // Another caller's event meanwhile: its step runs the queue's clock, which holds.
      await object.apply({ type: "join", githubId: 2 });
    });
    try {
      expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    } finally {
      await unwrapBuckets(stub);
    }
    expect(await contributions(stub)).toMatchObject([{ index: 1, output_sha256: sha(bytes) }]);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "done", outcome: "valid" });
    expect(await stub.snapshot()).toMatchObject({ phase: "OPEN", pausedBy: null });
  });

  it("removes the copies when the job stops being current while they are being made", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub, new TextEncoder().encode("superseded"));
    await wrapBucket(stub, "PUBLIC", (method, key, sql) => {
      if (method === "put" && key === ZKEY) {
        sql.exec("UPDATE jobs SET status = 'stale', json = json_set(json, '$.status', 'stale')");
      }
    });
    try {
      expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "stale" });
    } finally {
      await unwrapBuckets(stub);
    }
    expect(await contributions(stub)).toEqual([]);
    expect(await publicKeys()).toEqual([]);
  });

  it("tells a retry to come back while a copy of its index is in flight", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub, new TextEncoder().encode("slow"));
    const held = deferred();
    let puts = 0;
    // Only the first copy is held: a second one, if let through, would land at once.
    await wrapBucket(stub, "PUBLIC", async (method, key) => {
      if (method === "put" && key === ZKEY && ++puts === 1) await held.promise;
    });
    const first = stub.report(validReport(job));
    await vi.waitFor(async () => expect(await holding(LOG_KEY)).not.toBeNull());
    expect(await stub.report(validReport(job))).toEqual({ ok: false, refusal: "storage" });
    held.release();
    expect(await first).toEqual({ ok: true, status: "applied" });
    await unwrapBuckets(stub);
    expect(await contributions(stub)).toHaveLength(1);
  });

  it("never records a contribution outside the acceptance window: infra instead", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub, new TextEncoder().encode("late"));
    // The announced close passed (the queue's own clock has not closed yet).
    await runInDurableObject(stub, (_, state) => {
      const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM setup").one();
      const setup = JSON.parse(row.json) as Setup;
      setup.announcement.schedule.close = new Date(Date.now() - 3_600_000).toISOString();
      state.storage.sql.exec("UPDATE setup SET json = ?", JSON.stringify(setup));
    });
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    expect(await contributions(stub)).toEqual([]);
    expect(await stub.snapshot()).toMatchObject({ phase: "PAUSED", pausedBy: "verifier" });
    expect(await publicKeys()).toEqual([]);
  });
});
