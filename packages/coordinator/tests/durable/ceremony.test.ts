/**
 * The ceremony's object (SPEC §4.1–4.3): configured once, opened and closed by its alarm, the
 * slot's deadlines, links and nonces, and events no caller may send directly.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { QUEUE_RULES } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import {
  claimOf,
  expireNonces,
  GENESIS_SHA256,
  INIT,
  linkDirect,
  PRIVATE,
  PUBLIC,
  readTranscript,
  rewind,
  setQueue,
  setupInput,
  validReport,
} from "../support";

const DAY = 24 * 60 * 60_000;
let n = 0;
/** A fresh object per test: Durable Object storage is shared within a test file. */
const fresh = () => env.CEREMONY.getByName(`ceremony-test-${++n}`);

/** An object whose ceremony is already open (its opening alarm has run). */
async function opened() {
  const stub = fresh();
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + DAY));
  await runDurableObjectAlarm(stub);
  await Promise.all([1, 2].map((id) => linkDirect(stub, id)));
  return stub;
}

const alarmOf = (stub: ReturnType<typeof fresh>) =>
  runInDurableObject(stub, (_, state) => state.storage.getAlarm());

describe("CeremonyDO", () => {
  it("refuses to queue an identity without a linked wallet", async () => {
    const stub = await opened();
    expect(await stub.apply({ type: "join", githubId: 99 })).toEqual({
      ok: false,
      refusal: "not-linked",
    });
  });

  it("lets only invited accounts join a closed ceremony, whatever the caller sends", async () => {
    const stub = fresh();
    const admission = { mode: "closed", invited: [2] } as const;
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + DAY, { admission }));
    await runDurableObjectAlarm(stub);
    await Promise.all([1, 2].map((id) => linkDirect(stub, id)));
    expect(await stub.apply({ type: "join", githubId: 1, invited: true })).toEqual({
      ok: false,
      refusal: "not-invited",
    });
    expect((await stub.apply({ type: "join", githubId: 2 })).ok).toBe(true);
    expect((await stub.snapshot())?.slot?.githubId).toBe(2);
  });

  it("puts announced invitations ahead in an open ceremony, never a caller's claim", async () => {
    const stub = fresh();
    const admission = { mode: "open", invited: [3] } as const;
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + DAY, { admission }));
    await runDurableObjectAlarm(stub);
    await Promise.all([1, 2, 3, 4].map((id) => linkDirect(stub, id)));
    for (const [githubId, invited] of [
      [1, false],
      [2, false],
      [4, true],
      [3, false],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- joins in order
      expect((await stub.apply({ type: "join", githubId, invited })).ok).toBe(true);
    }
    const state = await stub.snapshot();
    expect(state?.slot?.githubId).toBe(1);
    expect(state?.queue.map((q) => [q.githubId, q.invited])).toEqual([
      [3, true],
      [2, false],
      [4, false],
    ]);
  });

  it("refuses a setup whose init.json is not the one the announcement pins", async () => {
    const input = setupInput(Date.now(), Date.now() + DAY);
    expect(await fresh().configure({ ...input, init: `${input.init} ` })).toEqual({
      ok: false,
      refusal: "malformed-setup",
    });
  });

  it("refuses finalizing through the queue: it has its own checked path", async () => {
    const stub = await opened();
    await stub.apply({ type: "close" });
    expect(await stub.apply({ type: "finalize" })).toEqual({
      ok: false,
      refusal: "invalid-transition",
    });
    expect((await stub.snapshot())?.phase).toBe("CLOSED");
  });

  it("keeps the link payload it verified, so each record can carry it", async () => {
    const stub = await opened();
    const linked = await stub.linked(1);
    expect(linked?.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(Math.abs((linked?.issuedAt ?? 0) - (linked?.linkedAt ?? 0) / 1000)).toBeLessThan(5);
  });

  it("refuses events until the schedule is configured", async () => {
    expect(await fresh().apply({ type: "join", githubId: 1 })).toEqual({
      ok: false,
      refusal: "not-configured",
    });
  });

  it("configures once, persists the state in SQLite and schedules the opening alarm", async () => {
    const stub = fresh();
    const schedule = { openAt: Date.now() + 60_000, closeAt: Date.now() + DAY };
    const input = setupInput(schedule.openAt, schedule.closeAt);
    expect(await stub.configure(input)).toEqual({ ok: true, effects: [] });
    expect(await stub.configure(input)).toEqual({ ok: true, effects: [] });
    expect(await stub.configure(setupInput(schedule.openAt + 1, schedule.closeAt))).toEqual({
      ok: false,
      refusal: "already-configured",
    });
    expect(await alarmOf(stub)).toBe(schedule.openAt);
    const persisted = await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec<{ json: string }>("SELECT json FROM queue_state").one(),
    );
    expect(JSON.parse(persisted.json)).toMatchObject({ phase: "SCHEDULED", schedule });
  });

  it("gives a queue state stored without its circuits the setup's", async () => {
    const stub = await opened();
    await runInDurableObject(stub, (_, state) => {
      const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM queue_state").one();
      const { circuits: _dropped, ...old } = JSON.parse(row.json) as Record<string, unknown>;
      state.storage.sql.exec("UPDATE queue_state SET json = ?", JSON.stringify(old));
    });
    expect((await stub.snapshot())?.circuits).toEqual(INIT.circuits.map((c) => c.name));
    expect(await stub.apply({ type: "join", githubId: 99 })).toMatchObject({ ok: false });
  });

  it("opens through its alarm, then waits for the close", async () => {
    const stub = await opened();
    const s = await stub.snapshot();
    expect(s?.phase).toBe("OPEN");
    expect(await alarmOf(stub)).toBe(s?.schedule.closeAt);
  });

  it("grants the slot on join and sets the alarm to the claim deadline", async () => {
    const stub = await opened();
    const r = await stub.apply({ type: "join", githubId: 1 });
    expect(r).toEqual({ ok: true, effects: [{ type: "grant", githubId: 1, seq: 1 }] });
    const s = await stub.snapshot();
    expect(await alarmOf(stub)).toBe((s?.slot?.grantedAt ?? 0) + QUEUE_RULES.claimWindowMs);
  });

  it("releases a no-show through the alarm and grants the next in line", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "join", githubId: 2 });
    await rewind(stub, QUEUE_RULES.claimWindowMs + 1000);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const s = await stub.snapshot();
    expect(s?.slot?.githubId).toBe(2);
    expect(s?.identities[1]?.noShows).toBe(1);
  });

  it("releases a claimed slot after missed heartbeats, and the alarm is idempotent", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "claim", githubId: 1 });
    await rewind(stub, QUEUE_RULES.heartbeatMs * QUEUE_RULES.missedHeartbeats + 1000);
    await runDurableObjectAlarm(stub);
    const after = await stub.snapshot();
    expect(after?.slot).toBeNull();
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(await stub.snapshot()).toEqual(after);
  });

  it("leaves the state untouched when an event is refused", async () => {
    const stub = await opened();
    const before = await stub.snapshot();
    expect(await stub.apply({ type: "claim", githubId: 9 })).toEqual({
      ok: false,
      refusal: "not-your-slot",
    });
    expect(await stub.snapshot()).toEqual(before);
  });

  it("records a no-show's release and moves the alarm to the next claim deadline", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "join", githubId: 2 });
    await rewind(stub, QUEUE_RULES.claimWindowMs + 1000);
    await runDurableObjectAlarm(stub);
    const s = await stub.snapshot();
    expect(await alarmOf(stub)).toBe((s?.slot?.grantedAt ?? 0) + QUEUE_RULES.claimWindowMs);
  });

  it("closes on schedule: an idle session is released, nothing waits any more", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "claim", githubId: 1 });
    await setQueue(stub, (s) => {
      s.schedule.closeAt = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub);
    expect(await stub.snapshot()).toMatchObject({ phase: "CLOSED", slot: null });
    expect(await alarmOf(stub)).toBeNull();
    const { records } = await readTranscript(stub);
    expect(records.at(-1)).toMatchObject({ type: "state", to: "CLOSED" });
  });

  it("keeps a session whose upload is being verified at close, until its result", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "claim", githubId: 1 });
    const bytes = new TextEncoder().encode("closing upload");
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
    expect(await stub.apply({ type: "close" })).toMatchObject({ ok: true });
    expect((await stub.snapshot())?.slot).not.toBeNull();
    expect(await stub.report(validReport(r.spec.job))).toEqual({ ok: true, status: "applied" });
    expect(await stub.snapshot()).toMatchObject({ phase: "CLOSED", slot: null });
    const contributions = (await readTranscript(stub)).records.filter(
      (x) => x.type === "contribution",
    );
    expect(contributions).toHaveLength(1);
    expect(await stub.apply({ type: "join", githubId: 2 })).toEqual({
      ok: false,
      refusal: "not-open",
    });
    await PUBLIC.delete(["contributions/shield/1.zkey", "logs/shield/1.log"]);
  });

  it("lets a queued identity leave", async () => {
    const stub = await opened();
    await stub.apply({ type: "join", githubId: 1 });
    await stub.apply({ type: "join", githubId: 2 });
    expect((await stub.snapshot())?.queue.map((e) => e.githubId)).toEqual([2]);
    expect(await stub.apply({ type: "leave", githubId: 2 })).toMatchObject({ ok: true });
    expect((await stub.snapshot())?.queue).toEqual([]);
  });

  it("refuses an expired nonce, and attestations before configure", async () => {
    const stub = fresh();
    const issued = await stub.issueNonce(7);
    if (!issued.ok) throw new Error(issued.refusal);
    await expireNonces(stub);
    const key = `0x${"07".repeat(20)}`;
    expect(
      await stub.link({
        githubId: 7,
        login: "u",
        scheme: "eip712",
        account: key,
        accountKey: key,
        signature: "ab".repeat(65),
        nonce: issued.nonce,
        issuedAt: Math.floor(Date.now() / 1000),
      }),
    ).toEqual({ ok: false, refusal: "nonce-invalid" });
    expect(await stub.linked(7)).toBeNull();
    expect(await stub.attest(7, {} as never, "ab")).toEqual({ ok: false, refusal: "not-linked" });
  });

  it("names the head a contributor must extend", async () => {
    const stub = await opened();
    expect(await stub.head("shield")).toEqual({ index: 0, outputSha256: GENESIS_SHA256.shield });
  });
});
