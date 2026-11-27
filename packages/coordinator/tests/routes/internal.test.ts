/**
 * The verifier's routes: bounded, then HMAC over this ceremony's id and the exact request; only a
 * pending job's object is served; a signed report applies once.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { MAX_LOG_CHARS, signRequest } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  PRIVATE,
  raw,
  refusal,
  setupInput,
  stubOf,
  unwrapBuckets,
  validReport,
  verifierCall,
  wrapBucket,
} from "../support";

const BYTES = new TextEncoder().encode("internal-test upload");
const OBJECT = "/internal/objects/1/shield/1";

async function pending() {
  const name = freshId("internal");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  const upload = {
    githubId: 1,
    circuit: "shield" as const,
    claim: claimOf(BYTES, GENESIS_SHA256.shield),
    size: BYTES.length,
  };
  const prepared = await stub.prepareUpload(upload);
  if (!prepared.ok) throw new Error(prepared.refusal);
  await PRIVATE.put(prepared.key, BYTES);
  const r = await stub.uploaded(upload, prepared.key);
  if (!r.ok) throw new Error(r.refusal);
  const job = r.spec.job;
  const signed = (
    method: string,
    path: string,
    body?: unknown,
    init: Parameters<typeof verifierCall>[3] = {},
  ) => verifierCall(method, path, body, { ceremony: name, ...init });
  return { stub, job, signed };
}

beforeEach(clearBuckets);

describe("the verifier's routes", () => {
  it("serves a pending job's object to a correctly signed request only", async () => {
    const { signed } = await pending();
    const ok = await signed("GET", OBJECT);
    expect([ok.status, new Uint8Array(await ok.arrayBuffer())]).toEqual([200, BYTES]);
    for (const r of [
      await raw(OBJECT),
      await raw(OBJECT, { headers: { "x-ceremony-timestamp": String(Date.now()) } }),
      await raw(OBJECT, {
        headers: { "x-ceremony-timestamp": "abc", "x-ceremony-signature": "ab".repeat(32) },
      }),
      await signed("GET", OBJECT, undefined, { now: Date.now() + 120_000 }),
      await signed("GET", OBJECT, undefined, { key: `${env.VERIFIER_HMAC_KEY}-other` }),
      await signed("GET", OBJECT, undefined, { ceremonyId: "mainnet-1" }),
    ]) {
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
    expect(await refusal(await signed("GET", "/internal/objects/x/shield/1"))).toEqual([
      400,
      "malformed",
    ]);
    expect(await refusal(await signed("GET", "/internal/objects/1/Nope/1"))).toEqual([
      400,
      "malformed",
    ]);
    expect(await refusal(await signed("GET", "/internal/objects/1/shield/2"))).toEqual([
      404,
      "unknown-job",
    ]);
  });

  it("binds the signature to the path, the method and the body", async () => {
    const { stub, job, signed } = await pending();
    const otherPath = await signed("GET", OBJECT, undefined, {
      signedPath: "/internal/objects/1/shield/2",
    });
    expect(await refusal(otherPath)).toEqual([401, "unauthenticated"]);
    const report = validReport(job);
    const otherMethod = await signed("POST", "/internal/verifications", report, {
      signedMethod: "PUT",
    });
    expect(await refusal(otherMethod)).toEqual([401, "unauthenticated"]);
    const tampered = await signed("POST", "/internal/verifications", report, {
      sentBody: JSON.stringify({ ...report, zkeyName: "mallory" }),
    });
    expect(await refusal(tampered)).toEqual([401, "unauthenticated"]);
    expect((await stub.latestJob(1, "shield"))?.status).toBe("pending");
  });

  it("refuses an oversized body by its declared length, once the MAC holds, before reading it", async () => {
    const big = "x".repeat(2 * MAX_LOG_CHARS + 128 * 1024);
    const signed = signRequest(
      env.VERIFIER_HMAC_KEY,
      env.CEREMONY_ID,
      "POST",
      "/internal/verifications",
      big,
      Date.now(),
    );
    const r = await raw("/internal/verifications", {
      method: "POST",
      headers: { "content-type": "application/json", ...signed },
      body: big,
    });
    expect(await refusal(r)).toEqual([413, "too-large"]);
  });

  it("refuses a malformed report, and applies a signed one once (a replay is a duplicate)", async () => {
    const { stub, job, signed } = await pending();
    expect(await refusal(await signed("POST", "/internal/verifications", { job }))).toEqual([
      400,
      "malformed",
    ]);
    const unknown = await signed(
      "POST",
      "/internal/verifications",
      validReport({ ...job, attempt: 9 }),
    );
    expect(await refusal(unknown)).toEqual([404, "unknown-job"]);
    const first = await signed("POST", "/internal/verifications", validReport(job));
    expect(await json(first)).toEqual({ ok: true, status: "applied" });
    const again = await signed("POST", "/internal/verifications", validReport(job));
    expect(await json(again)).toEqual({ ok: true, status: "duplicate" });
    const records = (await stub.transcript())?.records ?? [];
    expect(records.filter((r) => r.type === "contribution")).toHaveLength(1);
  });

  it("never serves a settled job's upload, even when its private copy could not be deleted", async () => {
    const { stub, job, signed } = await pending();
    await wrapBucket(stub, "PRIVATE", (method) => {
      if (method === "delete") throw new Error("R2 down");
    });
    expect(await stub.report({ job, result: "rejected", reason: "client-hash-mismatch" })).toEqual({
      ok: true,
      status: "applied",
    });
    await unwrapBuckets(stub);
    expect((await PRIVATE.list({ prefix: "verify/1/shield/" })).objects).toHaveLength(1);
    expect(await refusal(await signed("GET", OBJECT))).toEqual([404, "unknown-job"]);
  });
});
