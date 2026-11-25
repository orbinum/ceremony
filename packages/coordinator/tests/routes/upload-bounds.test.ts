/**
 * Upload bounds (SPEC §2.5): the claim, the declared length, the bytes, the head, the size bound
 * and the caller are all checked before or while the bytes move, and a refused upload leaves
 * nothing stored. Each test runs on a session of its own.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appWith,
  call,
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  GENESIS_SIZES,
  json,
  linkDirect,
  PRIVATE,
  refusal,
  routedTo,
  setupInput,
  stubOf,
  UNLIMITED,
  verifierCall,
} from "../support";

const ALICE = 801;
const BYTES = new TextEncoder().encode("an upload of the right length");

/** The ceremony of the current test: ALICE holds a claimed session, ALICE + 1 is linked. */
let name = "";
beforeEach(async () => {
  await clearBuckets();
  name = freshId("upload-bounds");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, ALICE);
  await linkDirect(stub, ALICE + 1);
  await stub.apply({ type: "join", githubId: ALICE });
  await stub.apply({ type: "claim", githubId: ALICE });
});

/** A streamed upload as ALICE (or `githubId`), headers overridable; no limits in the way. */
const put = (body: BodyInit | null, headers: Record<string, string>, githubId = ALICE) =>
  appWith(
    { UPLOAD_LIMIT: UNLIMITED, ...routedTo(name) },
    "http://localhost/api/session/upload/shield",
    {
      method: "PUT",
      headers: {
        "x-dev-github-id": String(githubId),
        "x-dev-github-login": `user-${githubId}`,
        // Set as a client sends it (a Request built in-process carries no such header).
        ...(body instanceof Uint8Array ? { "content-length": String(body.length) } : {}),
        ...headers,
      },
      body,
    },
  );
const streamOf = (bytes: Uint8Array) =>
  new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
const claimHeader = (claim = claimOf(BYTES, GENESIS_SHA256.shield)) => JSON.stringify(claim);
const privateObjects = async () => (await PRIVATE.list({ prefix: "verify/" })).objects;

describe("upload bounds (SPEC §2.5)", () => {
  it("refuses a missing, malformed or oversized claim before any byte moves", async () => {
    for (const claim of [
      undefined,
      "{not json",
      JSON.stringify({ inputSha256: "x" }),
      `"${"x".repeat(5000)}"`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await put(BYTES, claim === undefined ? {} : { "x-ceremony-claim": claim });
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect([r.status, (await json(r)).error.code]).toEqual([400, "malformed"]);
    }
    expect(await privateObjects()).toEqual([]);
  });

  // A body shorter or longer than declared aborts the stream: workerd logs an uncaught "client
  // disconnected" or "Network connection lost" for each, which is expected noise (and the only
  // uncaught lines a run should show).
  it("refuses a body without a length, of length zero, or not of its declared length", async () => {
    expect(
      await refusal(await put(streamOf(BYTES), { "x-ceremony-claim": claimHeader() })),
    ).toEqual([400, "malformed"]);
    const empty = await put(new Uint8Array(), {
      "x-ceremony-claim": claimHeader(),
      "content-length": "0",
    });
    expect(await refusal(empty)).toEqual([400, "malformed"]);
    for (const body of [new Uint8Array([...BYTES, 1, 2, 3]), BYTES.subarray(0, 5)]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const lie = await put(streamOf(body), {
        "x-ceremony-claim": claimHeader(),
        "content-length": String(BYTES.length),
      });
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect([lie.status, (await json(lie)).error.code]).toEqual([400, "malformed"]);
    }
    expect(await privateObjects()).toEqual([]);
    expect(await stubOf(name).latestJob(ALICE, "shield")).toBeNull();
  });

  it("refuses bytes that are not the claimed output, and leaves nothing stored", async () => {
    const r = await put(BYTES, {
      "x-ceremony-claim": claimHeader({
        ...claimOf(BYTES, GENESIS_SHA256.shield),
        outputSha256: "00".repeat(32),
      }),
    });
    expect([r.status, (await json(r)).error.code]).toEqual([400, "malformed"]);
    expect(await privateObjects()).toEqual([]);
  });

  it("refuses an unknown circuit, a stale head, a size over the bound and another caller", async () => {
    const nope = await appWith(routedTo(name), "http://localhost/api/session/upload/nope", {
      method: "PUT",
      headers: { "x-dev-github-id": String(ALICE), "x-ceremony-claim": claimHeader() },
      body: BYTES,
    });
    expect(await refusal(nope)).toEqual([400, "malformed"]);
    const stale = await put(BYTES, {
      "x-ceremony-claim": claimHeader(claimOf(BYTES, "11".repeat(32))),
    });
    expect([stale.status, (await json(stale)).error.code]).toEqual([409, "stale-head"]);
    const big = await put(BYTES, {
      "x-ceremony-claim": claimHeader(),
      "content-length": String(GENESIS_SIZES.shield + 1025),
    });
    expect([big.status, (await json(big)).error.code]).toEqual([413, "too-large"]);
    const other = await put(BYTES, { "x-ceremony-claim": claimHeader() }, ALICE + 1);
    expect([other.status, (await json(other)).error.code]).toEqual([409, "not-your-slot"]);
    expect(await privateObjects()).toEqual([]);
    expect(await stubOf(name).latestJob(ALICE, "shield")).toBeNull();
  });

  it("takes exactly one of two concurrent uploads of the same circuit", async () => {
    const [a, b] = await Promise.all([
      put(BYTES, { "x-ceremony-claim": claimHeader() }),
      put(BYTES, { "x-ceremony-claim": claimHeader() }),
    ]);
    expect([a.status, b.status].toSorted()).toEqual([202, 409]);
    expect(await privateObjects()).toHaveLength(1);
    // While it is being verified, nothing else of this turn is accepted.
    const busy = await put(BYTES, { "x-ceremony-claim": claimHeader() });
    expect([busy.status, (await json(busy)).error.code]).toEqual([409, "busy"]);
  });

  it("streams one upload per job at a time, refusing a second before its bytes move", async () => {
    const stub = stubOf(name);
    const request = {
      githubId: ALICE,
      circuit: "shield" as const,
      claim: claimOf(BYTES, GENESIS_SHA256.shield),
      size: BYTES.length,
    };
    const first = await stub.prepareUpload(request);
    expect(first.ok).toBe(true);
    expect(await stub.prepareUpload(request)).toEqual({ ok: false, refusal: "busy" });
    // The hold is in SQLite (an evicted object still sees it), sized by the declared bytes.
    const holds = await runInDurableObject(stub, (_, state) =>
      state.storage.sql
        .exec<{ id: string; until: number }>("SELECT id, until FROM holds")
        .toArray(),
    );
    expect(holds.map((h) => h.id)).toEqual(["upload:1/shield/1"]);
    const left = (holds[0]?.until ?? 0) - Date.now();
    expect(left).toBeGreaterThan(110_000);
    expect(left).toBeLessThanOrEqual(121_000);
    // A failed stream gives the job back at once.
    await stub.releaseUpload((first as { key: string }).key);
    expect((await stub.prepareUpload(request)).ok).toBe(true);
  });

  it("shows the contributor a rejection's reason, never the verifier's detail", async () => {
    const as = { ceremony: name };
    expect((await put(BYTES, { "x-ceremony-claim": claimHeader() })).status).toBe(202);
    const pending = await json(await call("GET", "/api/session/result/shield", ALICE, as));
    expect(pending).toMatchObject({ status: "pending" });
    const job = {
      seq: pending.seq,
      circuit: "shield",
      attempt: pending.attempt,
      index: pending.index,
    };
    await verifierCall(
      "POST",
      "/internal/verifications",
      { job, result: "rejected", reason: "zkey-verify-failed", detail: "internal detail" },
      as,
    );
    const result = await json(await call("GET", "/api/session/result/shield", ALICE, as));
    expect(result).toEqual({
      seq: job.seq,
      attempt: job.attempt,
      index: job.index,
      output_sha256: claimOf(BYTES, GENESIS_SHA256.shield).outputSha256,
      status: "rejected",
      reason: "zkey-verify-failed",
    });
    const none = await call("GET", "/api/session/result/transfer", ALICE + 5, as);
    expect(await refusal(none)).toEqual([404, "unknown-job"]);
    for (const path of ["/api/session/result/Nope", "/api/session/head/Nope"]) {
      // oxlint-disable-next-line no-await-in-loop -- one route at a time
      expect(await refusal(await call("GET", path, ALICE, as))).toEqual([400, "malformed"]);
    }
    // A well-formed name the ceremony does not have: nothing to find.
    const other = await call("GET", "/api/session/result/nope", ALICE, as);
    expect(await refusal(other)).toEqual([404, "unknown-job"]);
  });
});
