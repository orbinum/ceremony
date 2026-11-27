/**
 * Route limits: every session action is under the per-identity action limit, every identified read
 * a client polls under the per-identity poll limit; a refused request changes nothing. Limiters are
 * stubs counting per key.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  call,
  countingLimiter,
  freshId,
  json,
  linkDirect,
  refusal,
  setupInput,
  stubOf,
} from "../../support";

async function inSession() {
  const name = freshId("limits");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, 1);
  await stub.apply({ type: "join", githubId: 1 });
  await stub.apply({ type: "claim", githubId: 1 });
  return { name, stub };
}

describe("the per-identity action limit", () => {
  it("refuses claim, heartbeat, finish, attest and link over it, changing nothing", async () => {
    const { name, stub } = await inSession();
    const before = await stub.snapshot();
    for (const [path, body] of [
      ["/api/session/claim", undefined],
      ["/api/session/heartbeat", undefined],
      ["/api/session/finish", undefined],
      ["/api/session/attest", { payload: {}, signature: "0x" }],
      ["/api/link", { scheme: "eip712", payload: {}, signature: "0x" }],
      ["/api/queue/leave", undefined],
    ] as const) {
      const { binding, counts } = countingLimiter(0);
      const r = await call("POST", path, 1, {
        ceremony: name,
        env: { ACTION_LIMIT: binding },
        ...(body ? { body } : {}),
      });
      expect([path, ...(await refusal(r))]).toEqual([path, 429, "rate-limited"]);
      expect([...counts.keys()]).toEqual(["1"]);
    }
    expect(await stub.snapshot()).toEqual(before);
  });
});

describe("the per-identity poll limit", () => {
  it("bounds each identified read per identity, not per route", async () => {
    const { name } = await inSession();
    const { binding, counts } = countingLimiter(4);
    const read = (path: string, id = 1) =>
      call("GET", path, id, { ceremony: name, env: { POLL_LIMIT: binding } });
    const paths = [
      "/api/queue/me",
      "/api/session/head/shield",
      "/api/link",
      "/api/session/result/shield",
    ];
    const statuses = [];
    for (const path of paths) {
      statuses.push((await read(path)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 404]);
    for (const path of paths) {
      expect([path, ...(await refusal(await read(path)))]).toEqual([path, 429, "rate-limited"]);
    }
    expect(await json(await read("/api/queue/me", 2))).toMatchObject({ position: null });
    expect(Object.fromEntries(counts)).toEqual({ 1: 8, 2: 1 });
  });
});
