/**
 * Attacks on the verifier's routes (COORDINATOR §5): path spellings against the MAC and the router,
 * body bounds before the MAC, and reports that contradict the job or the network.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  buildAnnouncement,
  MAX_LOG_CHARS,
  serializeJson,
  type SetupInput,
  sha256Hex,
  signRequest,
} from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appWith,
  BASE,
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  GENESIS_SIZES,
  INIT,
  json,
  linkDirect,
  raw,
  readTranscript,
  refusal,
  routedTo,
  setQueue,
  setupInput,
  stubOf,
  validReport,
} from "../support";

const BYTES = new TextEncoder().encode("internal-attacks upload");
const OBJECT = "/internal/objects/1/shield/1";

/** A mainnet setup of this environment's ceremony (same fixture init, 50 contributions). */
function mainnetSetup(openAt: number, closeAt: number): SetupInput {
  const init = serializeJson(INIT);
  const announcement = buildAnnouncement({
    ceremonyId: env.CEREMONY_ID,
    network: "mainnet",
    initSha256: sha256Hex(new TextEncoder().encode(init)),
    circuitsSource: {
      repo: "https://github.com/orbinum/circuits",
      tag: "v0.16.0",
      commit: INIT.source.commit,
    },
    minContributions: 50,
    open: new Date(openAt),
    close: new Date(closeAt),
    beaconDelaySeconds: 86_400,
  });
  const sizes = Object.fromEntries(INIT.circuits.map((c) => [c.name, GENESIS_SIZES[c.name]]));
  return { announcement: serializeJson(announcement), init, genesisSizes: sizes };
}

async function pending(setup = setupInput(Date.now() - 1000, Date.now() + 86_400_000)) {
  const name = freshId("internal-attacks");
  const stub = stubOf(name);
  const configured = await stub.configure(setup);
  if (!configured.ok) throw new Error(`configure: ${JSON.stringify(configured)}`);
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
  await env.PRIVATE.put(prepared.key, BYTES);
  const r = await stub.uploaded(upload, prepared.key);
  if (!r.ok) throw new Error(r.refusal);
  /** Sends `path` with headers signed for `signedPath` (default: what is sent). */
  const send = (
    method: string,
    path: string,
    o: { signedPath?: string; signedMethod?: string; body?: string } = {},
  ) => {
    const headers = signRequest(
      env.VERIFIER_HMAC_KEY,
      env.CEREMONY_ID,
      o.signedMethod ?? method,
      o.signedPath ?? path,
      o.body ?? "",
      Date.now(),
    );
    return appWith(routedTo(name), `${BASE}${path}`, {
      method,
      headers: { ...headers, ...(o.body ? { "content-type": "application/json" } : {}) },
      ...(o.body ? { body: o.body } : {}),
    });
  };
  const report = (body: unknown) =>
    send("POST", "/internal/verifications", { body: JSON.stringify(body) });
  return { stub, job: r.spec.job, send, report };
}

beforeEach(clearBuckets);

describe("object path spellings", () => {
  it("authorizes no other spelling with a MAC for the canonical path", async () => {
    const { send } = await pending();
    for (const path of [
      "/internal/objects/1/sh%69eld/1",
      "/internal/objects/01/shield/1",
      "/internal/objects/1/shield/1/",
      "/internal//objects/1/shield/1",
      "/internal/objects/1%2Fshield%2F1",
      "/internal/objects/1/SHIELD/1",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      const r = await send("GET", path, { signedPath: OBJECT });
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect([path, (await refusal(r))[0]]).toEqual([path, 401]);
    }
  });

  it("refuses non-canonical numbers and traversal in the params, even when signed", async () => {
    const { send } = await pending();
    for (const [path, status] of [
      ["/internal/objects/01/shield/1", 400],
      ["/internal/objects/+1/shield/1", 400],
      ["/internal/objects/1/shield/1.0", 400],
      ["/internal/objects/1/shield/4294967296", 400],
      ["/internal/objects/0/shield/1", 400],
      ["/internal/objects/1/..%2F..%2Fshield/1", 400],
      ["/internal/objects/1/shield/1/", 404],
      ["/internal/objects/1%2Fshield%2F1", 404],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      const r = await send("GET", path);
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect([path, r.status]).toEqual([path, status]);
    }
  });

  it("refuses a query string, which the MAC does not cover", async () => {
    const { send } = await pending();
    for (const q of ["?anything=1", "?"]) {
      // oxlint-disable-next-line no-await-in-loop -- one spelling at a time
      const r = await send("GET", `${OBJECT}${q}`, { signedPath: OBJECT });
      expect(r.status).toBe(401);
    }
  });

  it("serves the same job to a percent-encoded spelling signed for itself (the param is decoded)", async () => {
    const { send } = await pending();
    const r = await send("GET", "/internal/objects/1/sh%69eld/1");
    expect(r.status).toBe(200);
    await r.body?.cancel();
  });

  it("resolves dot segments before the MAC, so they equal the canonical path", async () => {
    const { send } = await pending();
    const r = await send("GET", "/internal/objects/1/x/../shield/1", { signedPath: OBJECT });
    expect(r.status).toBe(200);
    await r.body?.cancel();
  });

  it("requires a MAC of its own for HEAD; a GET MAC does not authorize it", async () => {
    const { send } = await pending();
    expect((await send("HEAD", OBJECT, { signedMethod: "GET" })).status).toBe(401);
    const head = await send("HEAD", OBJECT);
    expect(head.status).toBe(200);
    await head.body?.cancel();
  });

  it("streams only the pending job: another attempt, seq or circuit is unknown", async () => {
    const { send } = await pending();
    for (const path of [
      "/internal/objects/1/shield/2",
      "/internal/objects/2/shield/1",
      "/internal/objects/1/unshield/1",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect(await refusal(await send("GET", path))).toEqual([404, "unknown-job"]);
    }
  });

  // Only a wider read window: any report is judged stale at receipt.
  it("serves the object after the verify deadline until an alarm or a report ticks", async () => {
    const { stub, send } = await pending();
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.verifyDeadline = Date.now() - 1;
    });
    const r = await send("GET", OBJECT);
    expect(r.status).toBe(200);
    await r.body?.cancel();
  });
});

describe("the MAC before the body", () => {
  it("refuses unsigned or stale headers before reading a chunked body", async () => {
    const stale = {
      "x-ceremony-timestamp": "1",
      "x-ceremony-signature": "ab".repeat(32),
      "x-ceremony-body-sha256": "cd".repeat(32),
    };
    for (const headers of [{}, stale]) {
      // More than the report bound: reading it would answer 413, not 401.
      const big = new Uint8Array(2 * MAX_LOG_CHARS + 128 * 1024);
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < big.length; i += 65_536) c.enqueue(big.subarray(i, i + 65_536));
          c.close();
        },
      });
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      const r = await raw("/internal/verifications", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        duplex: "half",
      } as RequestInit);
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
  });

  it("refuses forged headers with a fresh timestamp without reading the body", async () => {
    const chunk = new Uint8Array(65_536);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          pulled += 1;
          if (pulled > 40) c.close();
          else c.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
    const r = await raw("/internal/does-not-exist", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ceremony-timestamp": String(Date.now()),
        "x-ceremony-signature": "ab".repeat(32),
        "x-ceremony-body-sha256": "cd".repeat(32),
      },
      body,
      duplex: "half",
    } as RequestInit);
    expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    // The runtime may prime one chunk when it builds the request; the guard reads none of the 40.
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("refuses an oversized chunked report (no Content-Length) with 413, once signed", async () => {
    const text = "x".repeat(2 * MAX_LOG_CHARS + 128 * 1024);
    const big = new TextEncoder().encode(text);
    const headers = signRequest(
      env.VERIFIER_HMAC_KEY,
      env.CEREMONY_ID,
      "POST",
      "/internal/verifications",
      text,
      Date.now(),
    );
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < big.length; i += 65_536) c.enqueue(big.subarray(i, i + 65_536));
        c.close();
      },
    });
    const r = await raw("/internal/verifications", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      duplex: "half",
    } as RequestInit);
    expect(await refusal(r)).toEqual([413, "too-large"]);
  });

  it("takes an authentic request once: the same signed request again is a replay", async () => {
    const path = "/internal/does-not-exist";
    const headers = signRequest(
      env.VERIFIER_HMAC_KEY,
      env.CEREMONY_ID,
      "GET",
      path,
      "",
      Date.now(),
    );
    const first = await raw(path, { headers });
    expect(first.status).not.toBe(401);
    await first.body?.cancel();
    expect(await refusal(await raw(path, { headers }))).toEqual([401, "unauthenticated"]);
  });

  it("refuses a correctly signed but stale or future request before reading its body", async () => {
    for (const at of [Date.now() - 61_000, Date.now() + 61_000]) {
      const headers = signRequest(
        env.VERIFIER_HMAC_KEY,
        env.CEREMONY_ID,
        "POST",
        "/internal/verifications",
        "{}",
        at,
      );
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      const r = await raw("/internal/verifications", { method: "POST", headers, body: "{}" });
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
  });

  it("refuses a malformed header shape before reading the body", async () => {
    for (const headers of [
      { "x-ceremony-timestamp": `+${Date.now()}`, "x-ceremony-signature": "ab".repeat(32) },
      { "x-ceremony-timestamp": String(Date.now()), "x-ceremony-signature": "AB".repeat(32) },
      { "x-ceremony-timestamp": `${Date.now()}.0`, "x-ceremony-signature": "ab".repeat(32) },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      const r = await raw("/internal/verifications", { method: "POST", headers, body: "{}" });
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
  });
});

describe("reports that contradict the job", () => {
  it("judges a rejected for another index as infra: the turn is kept and the ceremony pauses", async () => {
    const { stub, job, report } = await pending();
    const r = await report({
      job: { ...job, index: job.index + 1 },
      result: "rejected",
      reason: "zkey-verify-failed",
    });
    expect(await json(r)).toEqual({ ok: true, status: "applied" });
    expect(await stub.latestJob(1, "shield")).toMatchObject({ outcome: "infra" });
    expect(await stub.snapshot()).toMatchObject({ phase: "PAUSED" });
  });

  it("answers unknown-job to a report for another circuit of the same session and attempt", async () => {
    const { stub, job, report } = await pending();
    const r = await report(validReport({ ...job, circuit: "unshield" }));
    expect(await refusal(r)).toEqual([404, "unknown-job"]);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "pending" });
  });

  it("refuses a valid with control characters in its log as malformed, changing nothing", async () => {
    const { stub, job, report } = await pending();
    const log = "ok\u001b[2J\r";
    const bad = { ...validReport(job), log, logSha256: sha256Hex(new TextEncoder().encode(log)) };
    expect(await refusal(await report(bad))).toEqual([400, "malformed"]);
    expect(await stub.latestJob(1, "shield")).toMatchObject({ status: "pending" });
  });

  it("changes nothing with a report after the job went stale, and treats a repeat as a no-op", async () => {
    const { stub, job, report } = await pending();
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.verifyDeadline = Date.now() - 1;
    });
    expect(await json(await report(validReport(job)))).toEqual({ ok: true, status: "stale" });
    expect(await json(await report(validReport(job)))).toEqual({ ok: true, status: "stale" });
    const records = (await readTranscript(stub)).records;
    expect(records.filter((r) => r.type === "contribution")).toEqual([]);
  });

  // Accepted limit (KL-26 in docs/KNOWN_LIMITS.md): the verifier is trusted for these fields.
  it("records a valid's zkeyName and deltaAfter on the verifier's word", async () => {
    const { stub, job, report } = await pending();
    const r = await report({
      ...validReport(job),
      zkeyName: "operator-chosen",
      deltaAfter: "00".repeat(64),
    });
    expect(await json(r)).toEqual({ ok: true, status: "applied" });
    const c = (await readTranscript(stub)).records.find((x) => x.type === "contribution");
    expect(c).toMatchObject({ zkey_name: "operator-chosen", delta_after: "00".repeat(64) });
  });
});

describe("a report's version string", () => {
  /**
   * `cli-local` marks a simulated contribution; recorded on mainnet it would fail every later
   * transcript integrity check, and records are append-only.
   */
  it("refuses a 'cli-local' verified contribution in a mainnet ceremony", async () => {
    const { stub, job, report } = await pending(
      mainnetSetup(Date.now() - 1000, Date.now() + 86_400_000),
    );
    const r = await report({ ...validReport(job), verifierVersion: "cli-local" });
    expect(await refusal(r)).toEqual([400, "malformed"]);
    const c = (await readTranscript(stub)).records.filter((x) => x.type === "contribution");
    expect(c).toEqual([]);
  });
});
