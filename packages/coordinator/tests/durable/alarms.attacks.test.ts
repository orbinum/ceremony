/**
 * Attacks the Durable Object's alarm under at-least-once delivery (duplicate, early, late, during a
 * promotion), and after the deployment moved on to another ceremony; a slow promotion copy that
 * must not rewind a heartbeat sent during it nor shorten the next contributor's claim window; the
 * beacon-time cut-off of attestations under a held clock; and a publication that throws, which
 * fails neither its commit nor later ones.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  CEREMONY_LAYOUT,
  type Job,
  nextDeadline,
  QUEUE_RULES,
  type QueueState,
} from "@orbinum-ceremony/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commit, type Store, unpublishUnrecorded } from "../../src/durable/store";
import {
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  linkDirect,
  PRIVATE,
  readTranscript,
  setQueue,
  setupInput,
  stubOf,
  unwrapBuckets,
  validReport,
  wrapBucket,
} from "../support";

type Stub = ReturnType<typeof stubOf>;
const alarmOf = (stub: Stub) => runInDurableObject(stub, (_, state) => state.storage.getAlarm());
const snapshot = async (stub: Stub) => (await stub.snapshot()) as QueueState;
const moveTo = (stub: Stub, id: string) =>
  runInDurableObject(stub, (instance) => {
    const store = (instance as unknown as { store: { env: Env } }).store;
    store.env = { ...store.env, CEREMONY_ID: id };
  });

async function granted(): Promise<Stub> {
  const stub = stubOf(freshId("alarms-attacks"));
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  return stub;
}

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

beforeEach(clearBuckets);

describe("alarms delivered at least once", () => {
  it("changes nothing on a duplicate or early alarm, and stays armed at the next deadline", async () => {
    const stub = await granted();
    const before = await snapshot(stub);
    const records = (await readTranscript(stub)).records.length;
    for (let i = 0; i < 3; i++) {
      await runInDurableObject(stub, (instance) =>
        (instance as { alarm(): Promise<void> }).alarm(),
      );
    }
    expect(await snapshot(stub)).toEqual(before);
    expect((await readTranscript(stub)).records).toHaveLength(records);
    expect(await alarmOf(stub)).toBe(nextDeadline(before));
  });

  it("applies the close before an overdue claim window: released as closed, not a no-show", async () => {
    const stub = await granted();
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.grantedAt -= 10 * 60_000;
      s.schedule.closeAt = Date.now() - 60_000;
    });
    await runDurableObjectAlarm(stub);
    const s = await snapshot(stub);
    expect(s).toMatchObject({ phase: "CLOSED", slot: null });
    expect(s.identities["1"]).toMatchObject({ noShows: 0, cooldownUntil: 0 });
    const last = (await readTranscript(stub)).records.at(-1) as { to?: string; reason?: string };
    expect(last).toMatchObject({ to: "CLOSED", reason: "schedule" });
    await runInDurableObject(stub, (instance) => (instance as { alarm(): Promise<void> }).alarm());
    expect(await snapshot(stub)).toEqual(s);
  });

  it("refuses a claim that arrives after its window, though the alarm never ran", async () => {
    const stub = await granted();
    await setQueue(stub, (s) => {
      if (s.slot) s.slot.grantedAt -= QUEUE_RULES.claimWindowMs + 1;
    });
    expect(await stub.apply({ type: "claim", githubId: 1 })).toEqual({
      ok: false,
      refusal: "not-your-slot",
    });
    expect((await snapshot(stub)).slot?.githubId).toBe(1);
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (instance) => (instance as { alarm(): Promise<void> }).alarm());
    expect(await snapshot(stub)).toMatchObject({ slot: null, identities: { "1": { noShows: 1 } } });
  });

  it("re-arms itself a second later while a promotion holds the clock, changing nothing", async () => {
    const stub = await granted();
    await stub.apply({ type: "claim", githubId: 1 });
    const before = await snapshot(stub);
    await runInDurableObject(stub, (instance) => {
      (instance as unknown as { store: { receivedAt: Map<string, number> } }).store.receivedAt.set(
        "shield/1",
        Date.now(),
      );
    });
    await runInDurableObject(stub, (instance) => (instance as { alarm(): Promise<void> }).alarm());
    const at = await alarmOf(stub);
    expect(at).not.toBeNull();
    expect((at ?? 0) - Date.now()).toBeLessThanOrEqual(1000);
    expect(await snapshot(stub)).toEqual(before);
    await runInDurableObject(stub, (instance) => {
      (
        instance as unknown as { store: { receivedAt: Map<string, number> } }
      ).store.receivedAt.clear();
    });
  });
});

describe("an object whose deployment moved on to another ceremony", () => {
  it("lets its alarm write nothing into the new folder, chain nothing, and drop itself", async () => {
    const stub = await granted();
    await setQueue(stub, (s) => {
      s.schedule.closeAt = Date.now() - 1000;
    });
    const before = await snapshot(stub);
    const records = (await readTranscript(stub)).records.length;
    const moved = freshId("alarms-moved");
    await moveTo(stub, moved);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await env.PUBLIC.list({ prefix: `${moved}/` })).objects).toEqual([]);
    const chained = (await readTranscript(stub)).records;
    expect(chained).toHaveLength(records);
    expect(chained.some((r) => (r as { ceremony_id?: string }).ceremony_id === moved)).toBe(false);
    expect(await snapshot(stub)).toEqual(before);
    expect(await alarmOf(stub)).toBeNull();
  });

  it("refuses to commit, and removes no public copy from the new folder", async () => {
    const stub = await granted();
    const state = await snapshot(stub);
    const moved = freshId("alarms-moved");
    const copy = `${moved}/${CEREMONY_LAYOUT.zkey("shield", 1)}`;
    await env.PUBLIC.put(copy, "the new ceremony's copy");
    await moveTo(stub, moved);
    await runInDurableObject(stub, async (instance) => {
      const store = (instance as unknown as { store: Store }).store;
      await expect(commit(store, state, [])).rejects.toThrow(/commit refused/);
      await unpublishUnrecorded(store, { circuit: "shield", index: 1 } as Job);
    });
    expect((await env.PUBLIC.list({ prefix: `${moved}/` })).objects.map((o) => o.key)).toEqual([
      copy,
    ]);
    expect(await snapshot(stub)).toEqual(state);
  });
});

describe("a promotion copy that outlasts the clock hold", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("keeps a contributor who heartbeats through a slow copy", async () => {
    const stub = await granted();
    await stub.apply({ type: "claim", githubId: 1 });
    const job = await uploadShield(stub, new TextEncoder().encode("slow copy"));
    const t0 = Date.now();
    await wrapBucket(stub, "PUBLIC", async (method, key, _sql, object) => {
      if (method !== "put" || key !== "contributions/shield/1.zkey") return;
      vi.setSystemTime(t0 + 65_000);
      await object.apply({ type: "heartbeat", githubId: 1 });
      vi.setSystemTime(t0 + 70_000);
    });
    try {
      expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    } finally {
      await unwrapBuckets(stub);
    }
    const s = await snapshot(stub);
    const rewound = s.slot?.lastHeartbeat;
    vi.setSystemTime(t0 + 95_000);
    const hb = await stub.apply({ type: "heartbeat", githubId: 1 });
    expect({ rewound: rewound === t0, hb }).toEqual({
      rewound: false,
      hb: { ok: true, effects: [] },
    });
  });
});

describe("a slot granted when a slow promotion settles", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("starts the next contributor's claim window at the grant, not at the result's receipt", async () => {
    const stub = await granted();
    await stub.apply({ type: "claim", githubId: 1 });
    await linkDirect(stub, 2);
    await stub.apply({ type: "join", githubId: 2 });
    await setQueue(stub, (s) => {
      for (const c of s.slot?.circuits ?? []) if (c.circuit !== "shield") c.status = "skipped";
    });
    const job = await uploadShield(stub, new TextEncoder().encode("slow copy, next in line"));
    const t0 = Date.now();
    await wrapBucket(stub, "PUBLIC", (method, key) => {
      if (method === "put" && key === "contributions/shield/1.zkey") vi.setSystemTime(t0 + 40_000);
    });
    try {
      expect(await stub.report(validReport(job))).toEqual({ ok: true, status: "applied" });
    } finally {
      await unwrapBuckets(stub);
    }
    const slot = (await snapshot(stub)).slot;
    expect(slot?.githubId).toBe(2);
    expect(slot?.grantedAt).toBeGreaterThanOrEqual(t0 + 40_000);
    expect(await stub.apply({ type: "claim", githubId: 2 })).toMatchObject({ ok: true });
    expect((await snapshot(stub)).identities["2"]?.noShows).toBe(0);
  });
});

describe("an attestation under a clock held for a promotion", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("is refused from the announced beacon time on, though the held clock is earlier", async () => {
    const stub = await granted();
    const closesAt = Date.parse((await stub.setup())?.announcement.schedule.beacon ?? "");
    vi.setSystemTime(closesAt + 1000);
    await runInDurableObject(stub, (instance) => {
      (instance as unknown as { store: { receivedAt: Map<string, number> } }).store.receivedAt.set(
        "shield/1",
        closesAt - 1000,
      );
    });
    try {
      expect(await stub.attest(1, {} as never, "ab")).toEqual({
        ok: false,
        refusal: "attestation-closed",
      });
    } finally {
      await runInDurableObject(stub, (instance) => {
        (
          instance as unknown as { store: { receivedAt: Map<string, number> } }
        ).store.receivedAt.clear();
      });
    }
  });
});

describe("a commit whose publication throws", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers the commit, persists it, and keeps committing", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stub = await granted();
    await stub.apply({ type: "claim", githubId: 1 });
    let saved = "";
    await runInDurableObject(stub, (_, state) => {
      saved = state.storage.sql.exec<{ json: string }>("SELECT json FROM setup").one().json;
      const broken = JSON.parse(saved);
      broken.init.circuits = null;
      state.storage.sql.exec("UPDATE setup SET json = ?", JSON.stringify(broken));
    });
    const before = (await snapshot(stub)).slot?.lastHeartbeat ?? 0;
    await new Promise((r) => setTimeout(r, 5));
    expect(await stub.apply({ type: "heartbeat", githubId: 1 })).toEqual({ ok: true, effects: [] });
    expect(errors.mock.calls.some(([first]) => first === "publish:")).toBe(true);
    expect((await snapshot(stub)).slot?.lastHeartbeat ?? 0).toBeGreaterThan(before);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE setup SET json = ?", saved);
    });
    expect(await stub.apply({ type: "heartbeat", githubId: 1 })).toEqual({ ok: true, effects: [] });
  });
});
