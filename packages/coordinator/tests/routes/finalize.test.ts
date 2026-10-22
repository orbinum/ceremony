/**
 * The finalize handover (SPEC §2.6, §4.3): final files only once the ceremony is closed,
 * `POST /admin/finalize` seals it once every final file is published with its hash, and a sealed
 * ceremony is read-only. Runs on a ceremony of the past (drand round 1000) under a faked clock.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  CEREMONY_LAYOUT,
  type FinalizeRequest,
  type Setup,
  sha256Hex,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appWith,
  call,
  claimOf,
  clearBuckets,
  CLOSE,
  finalBytes,
  finalizeRequest,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  OPEN,
  pastSetup,
  readTranscript,
  refusal,
  ROUND_AT,
  routedTo,
  setupInput,
  stubOf,
  validReport,
} from "../support";

/** A past ceremony with one accepted shield contribution, closed, at round 1000's emission. */
async function closedCeremony() {
  const id = freshId("finalize");
  const stub = stubOf(id);
  vi.setSystemTime(OPEN + 30_000);
  expect(await stub.configure(pastSetup())).toMatchObject({ ok: true });
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  const bytes = new TextEncoder().encode(`contribution of ${id}`);
  const upload = {
    githubId: 1,
    circuit: "shield" as const,
    claim: claimOf(bytes, GENESIS_SHA256.shield),
    size: bytes.length,
  };
  const prepared = await stub.prepareUpload(upload);
  if (!prepared.ok) throw new Error(prepared.refusal);
  await env.PRIVATE.put(prepared.key, bytes);
  const uploaded = await stub.uploaded(upload, prepared.key);
  if (!uploaded.ok) throw new Error(uploaded.refusal);
  expect(await stub.report(validReport(uploaded.spec.job))).toEqual({
    ok: true,
    status: "applied",
  });
  await stub.apply({ type: "finish", githubId: 1 });
  vi.setSystemTime(CLOSE + 1000);
  await runDurableObjectAlarm(stub);
  expect(await stub.snapshot()).toMatchObject({ phase: "CLOSED", slot: null });
  vi.setSystemTime(ROUND_AT + 60_000);
  const setup = (await stub.setup()) as unknown as Setup;
  const { records } = await readTranscript(stub);
  return { id, stub, request: finalizeRequest(setup, records) };
}

const putFile = (id: string, key: string, bytes: Uint8Array) =>
  appWith(routedTo(id), `http://localhost/admin/artifacts/${key}`, {
    method: "PUT",
    headers: {
      "x-ceremony-operator": "1",
      "x-content-sha256": sha256Hex(bytes),
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
const putFinals = async (id: string) => {
  const { zkey, vk } = finalBytes("shield");
  expect((await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), zkey)).status).toBe(201);
  expect((await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), vk)).status).toBe(201);
};
const finalize = (id: string, body: unknown) =>
  call("POST", "/admin/finalize", undefined, { ceremony: id, body });
const published = async (key: string) => (await env.PUBLIC.get(key))?.text();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await clearBuckets();
});
afterEach(() => vi.useRealTimers());

describe("final files (cli publish-final)", () => {
  it("are refused before the close, and for a circuit the ceremony does not have", async () => {
    vi.useRealTimers();
    const id = freshId("finals-open");
    await stubOf(id).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(id));
    expect((await stubOf(id).snapshot())?.phase).toBe("OPEN");
    const early = await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), finalBytes("shield").zkey);
    expect(await refusal(early)).toEqual([409, "invalid-transition"]);
    expect(await env.PUBLIC.head(CEREMONY_LAYOUT.finalZkey("shield"))).toBeNull();

    vi.useFakeTimers({ toFake: ["Date"] });
    const { id: closed } = await closedCeremony();
    const other = await putFile(
      closed,
      CEREMONY_LAYOUT.finalZkey("unshield"),
      finalBytes("shield").zkey,
    );
    expect(await refusal(other)).toEqual([400, "malformed"]);
    expect(await env.PUBLIC.head(CEREMONY_LAYOUT.finalZkey("unshield"))).toBeNull();
  });

  it("are published once closed: the same bytes again are a no-op, other bytes replace them until FINALIZED", async () => {
    const { id } = await closedCeremony();
    const key = CEREMONY_LAYOUT.finalZkey("shield");
    expect((await putFile(id, key, finalBytes("shield").zkey)).status).toBe(201);
    expect(await json(await putFile(id, key, finalBytes("shield").zkey))).toEqual({
      ok: true,
      key,
      unchanged: true,
    });
    // Nothing pins a final file before the handover: a wrong one may be corrected.
    const other = await putFile(id, key, new TextEncoder().encode("another key"));
    expect(other.status).toBe(201);
    expect(await published(key)).toBe("another key");
  });
});

describe("POST /admin/finalize", () => {
  it("seals the ceremony: the beacon last, the finals published with the final transcript", async () => {
    const { id, stub, request } = await closedCeremony();
    await putFinals(id);
    const r = await finalize(id, request);
    expect([r.status, await json(r)]).toEqual([200, { ok: true }]);
    expect((await stub.snapshot())?.phase).toBe("FINALIZED");
    const { records } = await readTranscript(stub);
    expect(records.at(-1)).toMatchObject({ type: "beacon", chain: request.beacon.chain });
    const transcript = validateTranscript(JSON.parse((await published("transcript.json")) ?? ""));
    expect(transcript.records).toEqual(records);
    expect(transcript.finals).toEqual(request.finals);
    expect(JSON.parse((await published("status.json")) ?? "")).toMatchObject({
      phase: "FINALIZED",
    });
  });

  it("restores a sealed final file only with the bytes its final record pins", async () => {
    const { id, request } = await closedCeremony();
    await putFinals(id);
    expect((await finalize(id, request)).status).toBe(200);
    // A replacement that raced the handover left other bytes behind.
    const key = CEREMONY_LAYOUT.finalZkey("shield");
    await env.PUBLIC.put(key, "a wrong final key");
    const other = await putFile(id, key, new TextEncoder().encode("yet another key"));
    expect(await refusal(other)).toEqual([409, "finalized"]);
    expect((await putFile(id, key, finalBytes("shield").zkey)).status).toBe(201);
    expect(await published(key)).toBe(new TextDecoder().decode(finalBytes("shield").zkey));
  });

  it("leaves a sealed ceremony read-only: every write answers finalized", async () => {
    const { id, stub, request } = await closedCeremony();
    await putFinals(id);
    expect((await finalize(id, request)).status).toBe(200);
    const before = (await readTranscript(stub)).records;
    const as = { ceremony: id };
    expect(await refusal(await finalize(id, request))).toEqual([409, "finalized"]);
    const replaced = await putFile(
      id,
      CEREMONY_LAYOUT.finalZkey("shield"),
      new TextEncoder().encode("another key"),
    );
    expect(await refusal(replaced)).toEqual([409, "finalized"]);
    for (const action of ["pause", "resume", "close"]) {
      // oxlint-disable-next-line no-await-in-loop -- one action at a time
      const r = await call("POST", "/admin/state", undefined, { ...as, body: { action } });
      // oxlint-disable-next-line no-await-in-loop -- one action at a time
      expect(await refusal(r)).toEqual([409, "finalized"]);
    }
    for (const path of ["/api/queue/join", "/api/session/claim", "/api/link/nonce"]) {
      // oxlint-disable-next-line no-await-in-loop -- one route at a time
      expect(await refusal(await call("POST", path, 1, as))).toEqual([409, "finalized"]);
    }
    const bytes = new TextEncoder().encode("late");
    const upload = {
      githubId: 1,
      circuit: "shield" as const,
      claim: claimOf(bytes, "00".repeat(32)),
      size: 4,
    };
    expect(await stub.prepareUpload(upload)).toEqual({ ok: false, refusal: "finalized" });
    const payload = {
      ceremony_id: env.CEREMONY_ID,
      github_id: 1,
      account: "0x",
      seq: 1,
      contributions: [],
      client: {},
    };
    expect(await stub.attest(1, payload as never, "ab")).toEqual({
      ok: false,
      refusal: "finalized",
    });
    // A new file is a write; the same final bytes again are still a no-op.
    expect(await refusal(await putFile(id, CEREMONY_LAYOUT.ptau, bytes))).toEqual([
      409,
      "finalized",
    ]);
    const same = await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), finalBytes("shield").vk);
    expect(await json(same)).toMatchObject({ ok: true, unchanged: true });
    expect((await readTranscript(stub)).records).toEqual(before);
  });

  it("refuses until every final file is published with its hash, and changes nothing", async () => {
    const { id, stub, request } = await closedCeremony();
    const missing = await finalize(id, request);
    expect([missing.status, (await json(missing)).error]).toEqual([
      409,
      {
        code: "not-finalizable",
        message: "final/shield.final.zkey is not published; final/shield.vk.json is not published",
      },
    ]);
    await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), finalBytes("shield").zkey);
    await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), new TextEncoder().encode("{}"));
    const differs = await finalize(id, request);
    expect((await json(differs)).error).toEqual({
      code: "not-finalizable",
      message: "final/shield.vk.json differs from its final record",
    });
    expect((await stub.snapshot())?.phase).toBe("CLOSED");
    expect((await readTranscript(stub)).records.some((r) => r.type === "beacon")).toBe(false);
  });

  it("refuses what core does not accept, a malformed body, and a ceremony still open", async () => {
    const { id, request } = await closedCeremony();
    await putFinals(id);
    const forged: FinalizeRequest = {
      ...request,
      beacon: { ...request.beacon, chain: "00".repeat(32) },
    };
    const r = await finalize(id, forged);
    expect(await refusal(r.clone())).toEqual([409, "not-finalizable"]);
    expect((await json(r)).error.message).toContain("the beacon's chain value is not its own");
    expect(await refusal(await finalize(id, { beacon: {} }))).toEqual([400, "malformed"]);

    vi.useRealTimers();
    const open = freshId("finalize-open");
    await stubOf(open).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(open));
    expect(await refusal(await finalize(open, request))).toEqual([409, "invalid-transition"]);
  });
});
