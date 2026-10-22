/**
 * Verifier results (SPEC §2.5, §4.2): applied once per job, only while the job is the slot's
 * current verification; valid, rejected, ambiguous and infra each move the queue as core says.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  QUEUE_RULES,
  sha256Hex,
  toHex,
  type VerifierReport,
  verifyChain,
} from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  claimOf,
  clearBuckets,
  GENESIS_SHA256,
  GENESIS_SIZES,
  linkDirect,
  LOG,
  readTranscript,
  setQueue,
  setupInput,
  unwrapBuckets,
  validReport,
  wrapBucket,
} from "../support";

let n = 0;
const fresh = () => env.CEREMONY.getByName(`verification-test-${++n}`);
type Stub = ReturnType<typeof fresh>;

const BYTES = new TextEncoder().encode("a contribution");
const claim = claimOf(BYTES, GENESIS_SHA256.shield);
const upload = (patch: object = {}) => ({
  githubId: 1,
  circuit: "shield" as const,
  claim,
  size: BYTES.length,
  ...patch,
});

/** An open ceremony whose contributor 1 holds a claimed slot. */
async function inSession(): Promise<Stub> {
  const stub = fresh();
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  return stub;
}

/** Puts the bytes where `prepareUpload` says and records the upload, as the route does. */
async function uploadShield(stub: Stub) {
  const prepared = await stub.prepareUpload(upload());
  if (!prepared.ok) throw new Error(prepared.refusal);
  await env.PRIVATE.put(prepared.key, BYTES);
  const r = await stub.uploaded(upload(), prepared.key);
  if (!r.ok) throw new Error(r.refusal);
  return r.spec.job;
}

const contributions = async (stub: Stub) =>
  (await readTranscript(stub)).records.filter((r) => r.type === "contribution");
const sha256Of = (o: R2Object) => toHex(o.checksums.sha256 ?? new ArrayBuffer(0));
const published = async () => ({
  zkey: await env.PUBLIC.head("contributions/shield/1.zkey"),
  log: await env.PUBLIC.head("logs/shield/1.log"),
});
const expireVerification = (stub: Stub) =>
  setQueue(stub, (s) => {
    if (s.slot) s.slot.verifyDeadline = Date.now() - 1;
  });

beforeEach(clearBuckets);

describe("CeremonyDO uploads", () => {
  it("bounds an upload by the head it extends and the genesis size", async () => {
    const stub = await inSession();
    const max = GENESIS_SIZES.shield + 1024;
    expect(await stub.prepareUpload(upload({ size: max + 1 }))).toEqual({
      ok: false,
      refusal: "too-large",
    });
    expect(
      await stub.prepareUpload(
        upload({ claim: { ...claim, inputSha256: "00".repeat(32) }, size: 10 }),
      ),
    ).toEqual({ ok: false, refusal: "stale-head" });
    expect(await stub.prepareUpload(upload({ githubId: 2, size: 10 }))).toEqual({
      ok: false,
      refusal: "not-your-slot",
    });
    expect(await stub.prepareUpload(upload({ size: max }))).toMatchObject({ ok: true });
  });

  it("refuses a key the turn no longer expects, and queue events that bypass verification", async () => {
    const stub = await inSession();
    expect(await stub.uploaded(upload({ size: 10 }), "verify/1/shield/2-x.zkey")).toEqual({
      ok: false,
      refusal: "busy",
    });
    expect(
      await stub.apply({
        type: "verified",
        seq: 1,
        circuit: "shield",
        attempt: 1,
        outcome: "valid",
      }),
    ).toEqual({ ok: false, refusal: "invalid-transition" });
  });
});

describe("CeremonyDO verification results", () => {
  it("accepts a valid result once: copies, record, job kept without its log", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub);
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "duplicate" });
    expect(await contributions(stub)).toHaveLength(1);
    const p = await published();
    expect([p.zkey && sha256Of(p.zkey), p.log && sha256Of(p.log)]).toEqual([
      claim.outputSha256,
      sha256Hex(new TextEncoder().encode(LOG)),
    ]);
    const stored = await stub.latestJob(1, "shield");
    expect(stored?.report).not.toHaveProperty("log");
    expect((await env.PRIVATE.list({ prefix: "verify/1/shield/" })).objects).toEqual([]);
    const t = await readTranscript(stub);
    expect(verifyChain(t.records, t.chainGenesis).ok).toBe(true);
  });

  it("drops a valid result that arrives after the verify deadline: no record, no artifact", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub);
    await expireVerification(stub);
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "stale" });
    expect(await contributions(stub)).toEqual([]);
    expect(await published()).toEqual({ zkey: null, log: null });
    expect((await env.PRIVATE.list({ prefix: "verify/1/shield/" })).objects).toEqual([]);
    // The silence was `infra`: the ceremony paused, the contributor was not penalized.
    const s = await stub.snapshot();
    expect(s).toMatchObject({ phase: "PAUSED", pausedBy: "verifier" });
    expect(s?.slot?.circuits[0]).toMatchObject({ status: "todo", attempts: 0, infra: 1 });
  });

  it("lets a result whose copy failed be retried, and records it once", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub);
    await wrapBucket(stub, "PUBLIC", (method, key) => {
      if (method === "put" && key === "contributions/shield/1.zkey") throw new Error("R2 down");
    });
    expect(await stub.report(validReport(job))).toEqual({ ok: false, refusal: "storage" });
    await unwrapBuckets(stub);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "pending" });
    expect(await contributions(stub)).toEqual([]);
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    expect(await contributions(stub)).toHaveLength(1);
  });

  it("treats a valid result that contradicts the job as infra, never as accepted", async () => {
    for (const contradiction of [
      (r: VerifierReport) => ({ ...r, contributionHash: "ff".repeat(64) }),
      (r: VerifierReport) => ({ ...r, log: "another log" }),
      (r: VerifierReport) => ({ ...r, job: { ...r.job, index: 2 } }),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      const stub = await inSession();
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      const job = await uploadShield(stub);
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      expect(await stub.report(contradiction(validReport(job)) as VerifierReport)).toEqual({
        ok: true,
        status: "applied",
      });
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      expect(await contributions(stub)).toEqual([]);
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      expect(await stub.snapshot()).toMatchObject({ phase: "PAUSED", pausedBy: "verifier" });
      // oxlint-disable-next-line no-await-in-loop -- one ceremony per case
      expect(await published()).toEqual({ zkey: null, log: null });
    }
  });

  it("releases the session after a second infra, counting it like a no-show", async () => {
    const stub = await inSession();
    let job = await uploadShield(stub);
    await stub.report({ job, result: "infra", detail: "x" });
    await stub.apply({ type: "resume" });
    job = await uploadShield(stub);
    expect(job.attempt).toBe(2);
    await stub.report({ job, result: "infra", detail: "x" });
    const s = await stub.snapshot();
    expect(s?.slot).toBeNull();
    expect(s?.identities[1]).toMatchObject({ noShows: 1, rejected: 0, banned: false });
  });

  it("gives an ambiguous result's attempt back, and keeps the ceremony open", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub);
    await stub.report({ job, result: "ambiguous", detail: "x" });
    expect(await stub.snapshot()).toMatchObject({ phase: "OPEN" });
    expect((await stub.snapshot())?.slot?.circuits[0]).toMatchObject({
      status: "todo",
      attempts: 0,
    });
    expect(await uploadShield(stub)).toMatchObject({ attempt: 2, index: 1 });
  });

  it("turns a verification nobody answers into infra through the alarm", async () => {
    const stub = await inSession();
    await uploadShield(stub);
    await expireVerification(stub);
    await runDurableObjectAlarm(stub);
    expect(await stub.snapshot()).toMatchObject({ phase: "PAUSED", pausedBy: "verifier" });
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "stale" });
    expect((await env.PRIVATE.list({ prefix: "verify/1/shield/" })).objects).toEqual([]);
    expect(QUEUE_RULES.infraPerSession).toBe(2);
  });

  it("consumes the turn on rejected, allows one retry, and ignores unknown jobs", async () => {
    const stub = await inSession();
    const job = await uploadShield(stub);
    expect(await stub.report({ job, result: "rejected", reason: "client-hash-mismatch" })).toEqual({
      ok: true,
      status: "applied",
    });
    expect(await stub.latestJob(1, "shield")).toMatchObject({
      status: "done",
      outcome: "rejected",
    });
    expect((await env.PRIVATE.list({ prefix: "verify/1/shield/1-" })).objects).toEqual([]);
    const retry = await uploadShield(stub);
    expect(retry).toMatchObject({ attempt: 2, index: 1 });
    expect(
      await stub.report({ job: { ...retry, attempt: 9 }, result: "infra", detail: "x" }),
    ).toEqual({
      ok: false,
      refusal: "unknown-job",
    });
    expect(await stub.report({ job, result: "rejected", reason: "client-hash-mismatch" })).toEqual({
      ok: true,
      status: "duplicate",
    });
    expect((await stub.snapshot())?.identities[1]?.rejected).toBe(1);
  });
});
