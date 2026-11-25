/**
 * Attacks on the operator routes: artifact paths and hashes, configure, state transitions, the
 * finalize body, and final files published at the wrong moment (COORDINATOR §3, SPEC §2.6, §4.3).
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  CEREMONY_LAYOUT,
  type FinalizeRequest,
  type Setup,
  sha256Hex,
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
  PRIVATE,
  PUBLIC,
  publishedSetup,
  readTranscript,
  refusal,
  ROUND_AT,
  routedTo,
  setupInput,
  stubOf,
  validReport,
} from "../support";
import { configureCeremony } from "../../src/actions";

const putFile = (
  id: string,
  path: string,
  bytes: Uint8Array,
  headers: Record<string, string> = {},
) =>
  appWith(routedTo(id), `http://localhost/admin/artifacts/${path}`, {
    method: "PUT",
    headers: {
      "x-ceremony-operator": "1",
      "x-content-sha256": sha256Hex(bytes),
      "content-length": String(bytes.length),
      ...headers,
    },
    body: bytes,
  });
const state = (id: string, action: string) =>
  call("POST", "/admin/state", undefined, { ceremony: id, body: { action } });
const finalize = (id: string, body: unknown) =>
  call("POST", "/admin/finalize", undefined, { ceremony: id, body });
const putRefusal = async (
  id: string,
  path: string,
  bytes: Uint8Array,
  headers: Record<string, string> = {},
) => refusal(await putFile(id, path, bytes, headers));

/** An open ceremony whose contributor 1 has an upload in verification. */
async function verifying(id: string) {
  const stub = stubOf(id);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  const bytes = new TextEncoder().encode(`in flight ${id}`);
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
  return { stub, job: r.spec.job };
}

/** A past one-circuit ceremony, closed at round 1000, with `contribute` accepted contributions. */
async function closedCeremony(contribute: boolean) {
  const id = freshId("admin-attacks");
  const stub = stubOf(id);
  vi.setSystemTime(OPEN + 30_000);
  await stub.configure(pastSetup());
  await runDurableObjectAlarm(stub);
  if (contribute) {
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
    await PRIVATE.put(prepared.key, bytes);
    const up = await stub.uploaded(upload, prepared.key);
    if (!up.ok) throw new Error(up.refusal);
    await stub.report(validReport(up.spec.job));
    await stub.apply({ type: "finish", githubId: 1 });
  }
  vi.setSystemTime(CLOSE + 1000);
  await runDurableObjectAlarm(stub);
  vi.setSystemTime(ROUND_AT + 60_000);
  const setup = (await stub.setup()) as unknown as Setup;
  const { records } = await readTranscript(stub);
  return { id, stub, request: finalizeRequest(setup, records) };
}

beforeEach(clearBuckets);

describe("PUT /admin/artifacts/*", () => {
  it("refuses paths outside the setup and final sets, however spelled", async () => {
    const id = freshId("admin-attacks-paths");
    const bytes = new TextEncoder().encode("x");
    for (const path of [
      "contributions/shield/1.zkey",
      "logs/shield/1.log",
      "transcript.json",
      "status.json",
      "genesis%2Finit.json",
      "GENESIS/init.json",
      "genesis/init.json/",
      "genesis//init.json",
      "genesis/%2e%2e/ceremony.json.x",
      "final/Nope.final.zkey",
      "final/constructor.vk.json",
      "verify/1/shield/1-x.zkey",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one path at a time
      const answer = await putRefusal(id, path, bytes);
      expect([path, ...answer]).toEqual([path, 400, "malformed"]);
    }
    expect((await PUBLIC.list()).objects).toEqual([]);
  });

  it("refuses a short, 0x-prefixed, empty or wrong X-Content-SHA256 and a wrong length, accepts uppercase", async () => {
    const id = freshId("admin-attacks-sha");
    const bytes = new TextEncoder().encode("a ptau mirror");
    const sha = sha256Hex(bytes);
    for (const h of [sha.slice(0, 62), `0x${sha}`, `${sha} `.repeat(2), ""]) {
      // oxlint-disable-next-line no-await-in-loop -- one header at a time
      const answer = await putRefusal(id, CEREMONY_LAYOUT.ptau, bytes, { "x-content-sha256": h });
      expect([h, ...answer]).toEqual([h, 400, "malformed"]);
    }
    expect(
      await refusal(
        await putFile(id, CEREMONY_LAYOUT.ptau, bytes, { "x-content-sha256": "00".repeat(32) }),
      ),
    ).toEqual([400, "malformed"]);
    expect(
      await refusal(
        await putFile(id, CEREMONY_LAYOUT.ptau, bytes, {
          "content-length": String(bytes.length + 1),
        }),
      ),
    ).toEqual([400, "malformed"]);
    expect((await PUBLIC.list()).objects).toEqual([]);
    const upper = await putFile(id, CEREMONY_LAYOUT.ptau, bytes, {
      "x-content-sha256": sha.toUpperCase(),
    });
    expect(upper.status).toBe(201);
    const other = new TextEncoder().encode("other bytes");
    expect(await refusal(await putFile(id, CEREMONY_LAYOUT.ptau, other))).toEqual([
      409,
      "immutable",
    ]);
  });

  /**
   * An upload still in verification at the close can still move the head, so a final computed
   * before its verdict could be for the wrong head.
   */
  it("refuses final files while a verification is still in flight after the close", async () => {
    const id = freshId("admin-attacks-final-early");
    const { stub, job } = await verifying(id);
    expect((await state(id, "close")).status).toBe(200);
    expect(await stub.snapshot()).toMatchObject({ phase: "CLOSED", slot: { seq: 1 } });
    const early = await putFile(
      id,
      CEREMONY_LAYOUT.finalZkey("shield"),
      new TextEncoder().encode("final on genesis"),
    );
    expect(early.status).toBe(409);
    expect(await PUBLIC.head(CEREMONY_LAYOUT.finalZkey("shield"))).toBeNull();
    // The in-flight verification then lands and moves the head.
    expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    expect((await stub.head("shield"))?.index).toBe(1);
  });
});

describe("configure and state", () => {
  it("refuses a different setup once configured, and texts that are not canonical", async () => {
    const id = freshId("admin-attacks-configure");
    const as = { ceremony: id };
    const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
    const configure = (body: unknown) =>
      call("POST", "/admin/configure", undefined, { ...as, body });
    expect(
      await refusal(
        await configure({ ...setup, announcement: setup.announcement.replace(/\n$/, "") }),
      ),
    ).toEqual([400, "malformed-setup"]);
    expect(
      await refusal(await configure({ ...setup, announcement: ` ${setup.announcement}` })),
    ).toEqual([400, "malformed-setup"]);
    // Sizes of circuits the ceremony does not have are dropped, not stored.
    expect(
      (await configure({ ...setup, genesisSizes: { ...setup.genesisSizes, extra: 1 } })).status,
    ).toBe(200);
    expect(Object.keys((await stubOf(id).setup())?.genesisSizes ?? {})).not.toContain("extra");
    expect((await configure(setup)).status).toBe(200);
    await runDurableObjectAlarm(stubOf(id));
    expect((await stubOf(id).snapshot())?.phase).toBe("OPEN");
    // The setup is frozen: another valid one (other schedule) is refused.
    const other = setupInput(Date.now() - 500, Date.now() + 3_600_000);
    expect(await stubOf(id).configure(other)).toEqual({ ok: false, refusal: "already-configured" });
    // So are setup files it does not have yet: nothing new joins the setup after it freezes.
    expect(await putRefusal(id, CEREMONY_LAYOUT.ptau, new Uint8Array([1, 2, 3]))).toEqual([
      409,
      "invalid-transition",
    ]);
  });

  it("freezes a setup only once its r1cs files are published with their pinned hashes", async () => {
    const id = freshId("admin-attacks-r1cs");
    const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
    const key = CEREMONY_LAYOUT.r1cs("shield");
    await PUBLIC.put(key, new TextEncoder().encode("another circuit"));
    const configure = () =>
      call("POST", "/admin/configure", undefined, { ceremony: id, body: setup });
    const r = await configure();
    expect([r.status, (await json(r)).error.message]).toEqual([
      400,
      expect.stringContaining("shield: published r1cs differs"),
    ]);
    await PUBLIC.delete(key);
    expect((await json(await configure())).error.message).toContain("shield: r1cs not published");
  });

  it("freezes only a setup of the deployment's network", async () => {
    const id = freshId("admin-attacks-network");
    const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
    for (const ENVIRONMENT of ["testnet", "production"]) {
      // oxlint-disable-next-line no-await-in-loop -- one deployment at a time
      const r = await configureCeremony({ ...env, ENVIRONMENT, CEREMONY_ID: id }, setup);
      expect([ENVIRONMENT, r.ok]).toEqual([ENVIRONMENT, false]);
    }
    expect(await stubOf(id).setup()).toBeNull();
  });

  it("refuses invalid transitions: resume when OPEN, close twice, pause or resume after CLOSED", async () => {
    const later = freshId("admin-attacks-scheduled");
    await stubOf(later).configure(setupInput(Date.now() + 3_600_000, Date.now() + 86_400_000));
    for (const action of ["pause", "resume", "close"]) {
      // oxlint-disable-next-line no-await-in-loop -- one action at a time
      expect(await refusal(await state(later, action))).toEqual([409, "invalid-transition"]);
    }
    const id = freshId("admin-attacks-state");
    await stubOf(id).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(id));
    expect(await refusal(await state(id, "resume"))).toEqual([409, "invalid-transition"]);
    expect((await state(id, "close")).status).toBe(200);
    for (const action of ["close", "pause", "resume"]) {
      // oxlint-disable-next-line no-await-in-loop -- one action at a time
      expect(await refusal(await state(id, action))).toEqual([409, "invalid-transition"]);
    }
    expect(
      (await readTranscript(stubOf(id))).records.map((r) => (r as { to?: string }).to),
    ).toEqual(["OPEN", "CLOSED"]);
  });
});

describe("POST /admin/finalize", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("refuses an oversized body, duplicated, missing or mismatched finals, then seals once", async () => {
    const { id, stub, request } = await closedCeremony(true);
    const { zkey, vk } = finalBytes("shield");
    await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), zkey);
    await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), vk);
    const big = { ...request, padding: "x".repeat(70 * 1024) };
    expect(await refusal(await finalize(id, big))).toEqual([413, "too-large"]);
    const dup: FinalizeRequest = {
      ...request,
      finals: [request.finals[0], request.finals[0]] as FinalizeRequest["finals"],
    };
    expect(await refusal(await finalize(id, dup))).toEqual([400, "malformed"]);
    expect(await refusal(await finalize(id, { ...request, finals: [] }))).toEqual([
      400,
      "malformed",
    ]);
    const wrongHash = {
      ...request,
      finals: [{ ...request.finals[0], final_zkey_sha256: "00".repeat(32) }],
    };
    expect(await refusal(await finalize(id, wrongHash))).toEqual([409, "not-finalizable"]);
    expect((await stub.snapshot())?.phase).toBe("CLOSED");
    expect((await finalize(id, request)).status).toBe(200);
    expect(await refusal(await finalize(id, request))).toEqual([409, "finalized"]);
  });

  it("refuses a ceremony without the minimum contributions", async () => {
    const { id, request } = await closedCeremony(false);
    const { zkey, vk } = finalBytes("shield");
    await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), zkey);
    await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), vk);
    const r = await finalize(id, request);
    expect(await refusal(r.clone())).toEqual([409, "not-finalizable"]);
    expect((await json(r)).error.message).toContain("shield: 0 contributions");
  });

  /** Nothing pins a final file before the finals arrive, so a wrong upload can be corrected. */
  it("lets a final file that no final record pins yet be corrected, then finalizes", async () => {
    const { id, stub, request } = await closedCeremony(true);
    const { zkey, vk } = finalBytes("shield");
    await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), zkey);
    expect(
      (await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), new TextEncoder().encode("{}"))).status,
    ).toBe(201);
    expect((await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), vk)).status).toBe(201);
    expect((await finalize(id, request)).status).toBe(200);
    expect((await stub.snapshot())?.phase).toBe("FINALIZED");
  });

  it("does not seal while a final file is still being written", async () => {
    const { id, stub, request } = await closedCeremony(true);
    const { zkey, vk } = finalBytes("shield");
    await putFile(id, CEREMONY_LAYOUT.finalZkey("shield"), zkey);
    await putFile(id, CEREMONY_LAYOUT.finalVk("shield"), vk);
    // Two writes of the same file: the first to end does not release the other's hold.
    const first = await stub.holdFinalWrite();
    const second = await stub.holdFinalWrite();
    expect(await refusal(await finalize(id, request))).toEqual([409, "busy"]);
    await stub.releaseFinalWrite(first);
    expect(await refusal(await finalize(id, request))).toEqual([409, "busy"]);
    await stub.releaseFinalWrite(second);
    expect((await finalize(id, request)).status).toBe(200);
  });
});

describe("POST /admin/unhold", () => {
  it("lifts a hold only for a held identity, from a well-formed body", async () => {
    const id = freshId("admin-attacks-unhold");
    const stub = stubOf(id);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stub);
    await linkDirect(stub, 9);
    // Held after repeated infra releases (the queue's own rule is tested in core).
    await runInDurableObject(stub, (_, ctx) => {
      const row = ctx.storage.sql.exec("SELECT json FROM queue_state").one();
      const q = JSON.parse(String(row.json));
      q.identities["9"] = {
        noShows: 0,
        cooldownUntil: 0,
        rejected: 0,
        banned: false,
        infraResults: 6,
        held: true,
        accepted: [],
      };
      ctx.storage.sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(q));
    });
    expect(await stub.apply({ type: "join", githubId: 9 })).toMatchObject({
      ok: false,
      refusal: "held",
    });
    const unhold = (body: unknown) =>
      call("POST", "/admin/unhold", undefined, { ceremony: id, body });
    for (const body of [
      {},
      { githubId: "9" },
      { githubId: 0 },
      { githubId: 9.5 },
      { githubId: 9, x: 1 },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one body at a time
      expect(await refusal(await unhold(body))).toEqual([400, "malformed"]);
    }
    expect(await refusal(await unhold({ githubId: 10 }))).toEqual([409, "invalid-transition"]);
    expect((await unhold({ githubId: 9 })).status).toBe(200);
    expect(await refusal(await unhold({ githubId: 9 }))).toEqual([409, "invalid-transition"]);
    expect(await stub.apply({ type: "join", githubId: 9 })).toMatchObject({ ok: true });
  });

  it("needs the operator", async () => {
    const id = freshId("admin-attacks-unhold-op");
    const r = await appWith(routedTo(id), "http://localhost/admin/unhold", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ githubId: 9 }),
    });
    expect(r.status).toBe(403);
  });
});
