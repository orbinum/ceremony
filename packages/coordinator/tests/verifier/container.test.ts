/**
 * The verifier container's Durable Object against a fake container: a claimed turn warms it, a
 * job is posted once per container start and kept until its deadline, so a container lost
 * mid-job (a crash, a deploy) gets it again, and a stale job never starts one.
 */
import { env } from "cloudflare:workers";
import { type JobSpec, sha256Utf8 } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { VerifierContainer } from "../../src/verifier";
import { freshId, setupInput, stubOf } from "../support";

/** Durable storage in memory, enough for the object (no SQL). */
function fakeStorage() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    data,
    alarm: () => alarm,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async (key: string, value: unknown) => void data.set(key, structuredClone(value)),
    delete: async (keys: string | string[]) => {
      for (const k of [keys].flat()) data.delete(k);
    },
    list: async <T>({ prefix }: { prefix: string }) =>
      new Map([...data].filter(([k]) => k.startsWith(prefix)) as [string, T][]),
    setAlarm: async (at: number) => void (alarm = at),
  };
}

/** A container that answers `/healthz` and records each `/verify`, per start. */
function fakeContainer() {
  const c = {
    running: false,
    starts: 0,
    posted: [] as { start: number; job: string }[],
    images: { verifier: "image:v1" },
    image: "image:v1",
    start: () => {
      c.running = true;
      c.starts += 1;
      c.image = c.images.verifier;
    },
    destroy: async () => void (c.running = false),
    inspect: async () => ({ image: c.image }),
    setInactivityTimeout: async () => undefined,
    getTcpPort: () => ({
      fetch: async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith("/healthz")) return new Response("{}", { status: 200 });
        const spec = JSON.parse(String(init?.body)) as JobSpec;
        c.posted.push({ start: c.starts, job: `${spec.job.seq}/${spec.job.circuit}` });
        return new Response(null, { status: 202 });
      },
    }),
  };
  return c;
}

const spec = (seq: number) =>
  ({
    job: { seq, circuit: "shield", attempt: 1, index: 1 },
    claim: { inputSha256: sha256Utf8("in"), outputSha256: sha256Utf8("out") },
  }) as unknown as JobSpec;

async function object() {
  const ceremony = freshId("container");
  await stubOf(ceremony).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  const storage = fakeStorage();
  const container = fakeContainer();
  const ctx = { storage, container } as unknown as DurableObjectState;
  const routed = { ...env, CEREMONY_ID: ceremony, VERIFIER_URL: "" } as Env;
  // The base class only takes a real DurableObjectState: the object is built around the fakes.
  const o = Object.create(VerifierContainer.prototype) as VerifierContainer;
  Object.defineProperties(o, { ctx: { value: ctx }, env: { value: routed } });
  return { o, storage, container };
}

describe("VerifierContainer", () => {
  it("starts the container for a claimed turn, before any job", async () => {
    const { o, storage, container } = await object();
    await o.warm();
    expect(storage.alarm()).not.toBeNull();
    await o.alarm();
    expect([container.running, container.starts, container.posted]).toEqual([true, 1, []]);
  });

  it("posts a job once per container start and keeps it until its deadline", async () => {
    const { o, storage, container } = await object();
    await o.enqueue(spec(1));
    await o.alarm();
    await o.alarm();
    expect(container.posted).toEqual([{ start: 1, job: "1/shield" }]);
    expect(storage.data.has("job:1/shield/1")).toBe(true);
    // Watched while it may still run.
    expect(storage.alarm()).toBeGreaterThan(Date.now());
  });

  it("posts a job again to a container that replaced the one that had it (a crash, a deploy)", async () => {
    const { o, container } = await object();
    await o.enqueue(spec(2));
    await o.alarm();
    container.running = false;
    await o.alarm();
    container.images.verifier = "image:v2";
    await o.alarm();
    expect(container.posted.map((p) => p.start)).toEqual([1, 2, 3]);
  });

  it("drops a job past its deadline without starting anything", async () => {
    const { o, storage, container } = await object();
    await storage.put("job:3/shield/1", { spec: spec(3), at: Date.now() - 7 * 60_000 });
    await o.alarm();
    expect([container.starts, storage.data.size]).toEqual([0, 0]);
  });
});
