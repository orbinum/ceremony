/**
 * Availability guards (SPEC §4.1, KL-38): each limit is keyed by identity or client network (an
 * IPv6 /64), a request without a client address is refused outside a local run, and Turnstile
 * runs before the join limit. Limiters are stubs counting per key, without real time windows.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appWith,
  call,
  countingLimiter,
  freshId,
  json,
  linkDirect,
  refusal,
  routedTo,
  sessionCookie,
  setupInput,
  stubOf,
} from "../support";

/** A fresh, open ceremony; its object's name. */
async function opened(...linked: number[]) {
  const name = freshId("abuse");
  await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stubOf(name));
  // oxlint-disable-next-line no-await-in-loop -- links in order
  for (const id of linked) await linkDirect(stubOf(name), id);
  return name;
}

const siteverify = (answer: (form: FormData) => unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_, init) => Response.json(answer(init?.body as FormData)));

describe("rate limits", () => {
  it("refuse a burst of link nonces from one identity, not from another, without issuing any", async () => {
    const name = await opened();
    const { binding, counts } = countingLimiter(10);
    const nonce = (id: number) =>
      call("POST", "/api/link/nonce", id, { ceremony: name, env: { NONCE_LIMIT: binding } });
    const given: string[] = [];
    for (let i = 0; i < 10; i++) {
      // oxlint-disable-next-line no-await-in-loop -- requests in order, as a burst
      const r = await nonce(7001);
      expect(r.status).toBe(200);
      // oxlint-disable-next-line no-await-in-loop -- requests in order, as a burst
      given.push(((await r.json()) as { nonce: string }).nonce);
    }
    expect(await refusal(await nonce(7001))).toEqual([429, "rate-limited"]);
    expect((await nonce(7002)).status).toBe(200);
    expect(Object.fromEntries(counts)).toEqual({ 7001: 11, 7002: 1 });
    const issued = await runInDurableObject(stubOf(name), (_, state) =>
      state.storage.sql.exec("SELECT nonce FROM nonces WHERE github_id = 7001").toArray(),
    );
    // The newest live nonces are kept (at most five), and the refused request issued none.
    expect(issued.map((r) => r.nonce).toSorted()).toEqual(given.slice(-5).toSorted());
  });

  it("bound joins, uploads and queue actions per identity", async () => {
    const name = await opened(7101);
    for (const [binding, method, path] of [
      ["JOIN_LIMIT", "POST", "/api/queue/join"],
      ["UPLOAD_LIMIT", "PUT", "/api/session/upload/shield"],
      ["ACTION_LIMIT", "POST", "/api/queue/leave"],
    ] as const) {
      const { binding: limiter, counts } = countingLimiter(0);
      // oxlint-disable-next-line no-await-in-loop -- one limit at a time
      const r = await call(method, path, 7101, { ceremony: name, env: { [binding]: limiter } });
      // oxlint-disable-next-line no-await-in-loop -- one limit at a time
      expect(await refusal(r)).toEqual([429, "rate-limited"]);
      expect([...counts.keys()]).toEqual(["7101"]);
    }
    expect((await stubOf(name).snapshot())?.slot).toBeNull();
  });

  it("bound public reads per client network: a whole IPv6 /64 is one client", async () => {
    const name = await opened();
    const { binding } = countingLimiter(120);
    const read = (ip: string) =>
      call("GET", "/api/status", undefined, {
        ceremony: name,
        env: { READ_LIMIT: binding },
        headers: { "cf-connecting-ip": ip },
      });
    const statuses: number[] = [];
    for (let i = 1; i <= 300; i++) {
      // oxlint-disable-next-line no-await-in-loop -- requests in order, as a burst
      statuses.push((await read(`2001:db8:1:2::${i.toString(16)}`)).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(120);
    expect(statuses.slice(120).every((s) => s === 429)).toBe(true);
    expect((await read("2001:db8:1:3::1")).status).toBe(200);
    expect((await read("203.0.113.7")).status).toBe(200);
  });

  it("refuse a request without a client address outside a local run, and count none", async () => {
    const { binding, counts } = countingLimiter(1000);
    const r = await appWith(
      { ENVIRONMENT: "production", READ_LIMIT: binding },
      "https://ceremony.example/api/status",
    );
    expect(await refusal(r)).toEqual([403, "forbidden"]);
    expect(counts.size).toBe(0);
    const local = await appWith({ READ_LIMIT: binding }, "http://localhost/api/status");
    expect(await refusal(local)).toEqual([503, "not-configured"]);
    expect([...counts.keys()]).toEqual(["loopback"]);
  });
});

/** Who holds the slot or waits in the queue. */
const queued = async (name: string) => {
  const s = await stubOf(name).snapshot();
  return [s?.slot?.githubId, ...(s?.queue.map((e) => e.githubId) ?? [])].filter(Boolean);
};

describe("Turnstile on joining (outside a local run)", () => {
  afterEach(() => vi.restoreAllMocks());
  const HOST = "https://ceremony.example";
  const join = (name: string, gid: number, token?: string, patch: Partial<Env> = {}) =>
    appWith({ ENVIRONMENT: "production", ...routedTo(name), ...patch }, `${HOST}/api/queue/join`, {
      method: "POST",
      headers: {
        cookie: sessionCookie(gid),
        "cf-connecting-ip": "198.51.100.4",
        ...(token ? { "x-turnstile-token": token } : {}),
      },
    });

  it("asks siteverify with the secret and the address, and needs a solve on this host", async () => {
    const name = await opened(7201, 7202);
    const spy = siteverify((form) => ({
      success: form.get("response") === "good",
      hostname: form.get("response") === "good" ? "ceremony.example" : "x",
    }));
    const ok = await join(name, 7201, "good");
    expect([ok.status, await json(ok)]).toEqual([200, { ok: true }]);
    const form = spy.mock.calls[0]?.[1]?.body as FormData;
    expect([form.get("secret"), form.get("remoteip")]).toEqual([
      env.TURNSTILE_SECRET,
      "198.51.100.4",
    ]);
    expect(await refusal(await join(name, 7202, "bad"))).toEqual([403, "turnstile"]);
    expect(await queued(name)).toEqual([7201]);
  });

  it("refuses a failed solve even when it names this host", async () => {
    const name = await opened(7208);
    siteverify(() => ({ success: false, hostname: "ceremony.example" }));
    expect(await refusal(await join(name, 7208, "good"))).toEqual([403, "turnstile"]);
    expect(await queued(name)).toEqual([]);
  });

  it("refuses a solve for another host, a missing or oversized token, and an unreachable service", async () => {
    const name = await opened(7203);
    const spy = siteverify(() => ({ success: true, hostname: "phishing.example" }));
    expect(await refusal(await join(name, 7203, "good"))).toEqual([403, "turnstile"]);
    expect(await refusal(await join(name, 7203))).toEqual([403, "turnstile"]);
    expect(await refusal(await join(name, 7203, "x".repeat(2049)))).toEqual([403, "turnstile"]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRejectedValue(new Error("offline"));
    expect(await refusal(await join(name, 7203, "good"))).toEqual([403, "turnstile"]);
    expect(await queued(name)).toEqual([]);
  });

  it("runs before the rate limit: bots never spend an identity's quota", async () => {
    const name = await opened(7207);
    const { binding, counts } = countingLimiter(5);
    siteverify(() => ({ success: false }));
    // oxlint-disable-next-line no-await-in-loop -- requests in order, as a burst
    for (let i = 0; i < 6; i++) await join(name, 7207, "bad", { JOIN_LIMIT: binding });
    expect(counts.size).toBe(0);
    siteverify(() => ({ success: true, hostname: "ceremony.example" }));
    const r = await join(name, 7207, "good", { JOIN_LIMIT: binding });
    expect([r.status, await json(r)]).toEqual([200, { ok: true }]);
  });
});
