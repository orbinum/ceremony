/**
 * The contributor API in a local run (SPEC §4.1–4.2): identified routes need an identity; a
 * session is joined, claimed, kept and finished, then the next contributor gets the slot; the
 * public status names no identity.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, freshId, json, linkDirect, refusal, setupInput, stubOf } from "../support";

const [ALICE, BOB] = [101, 202];

/** An open ceremony with ALICE and BOB linked; calls to it. */
async function opened() {
  const name = freshId("api");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, ALICE);
  await linkDirect(stub, BOB);
  return (method: string, path: string, githubId?: number) =>
    call(method, `/api${path}`, githubId, { ceremony: name });
}

describe("API (local development identity)", () => {
  it("refuses identified routes without an identity", async () => {
    const api = await opened();
    expect(await refusal(await api("POST", "/queue/join"))).toEqual([401, "unauthenticated"]);
  });

  it("runs a session: join, claim, heartbeat, finish, and the next contributor gets the slot", async () => {
    const api = await opened();
    expect((await api("POST", "/queue/join", ALICE)).status).toBe(200);
    const mine = await json(await api("GET", "/queue/me", ALICE));
    expect(mine).toMatchObject({ phase: "OPEN", position: null, slot: { seq: 1, claimed: false } });
    expect(mine.slot.circuits.map((c: { circuit: string }) => c.circuit)).toEqual([
      "shield",
      "unshield",
      "transfer",
    ]);

    expect((await api("POST", "/queue/join", BOB)).status).toBe(200);
    expect(await json(await api("GET", "/queue/me", BOB))).toMatchObject({
      position: 1,
      slot: null,
    });
    expect(await refusal(await api("POST", "/session/claim", BOB))).toEqual([409, "not-your-slot"]);

    for (const path of ["/session/claim", "/session/heartbeat", "/session/finish"]) {
      // oxlint-disable-next-line no-await-in-loop -- the session steps happen in order
      expect(await json(await api("POST", path, ALICE))).toEqual({ ok: true });
    }
    expect(await json(await api("GET", "/queue/me", BOB))).toMatchObject({ slot: { seq: 2 } });
    expect(await json(await api("GET", "/status"))).toEqual({
      phase: "OPEN",
      queued: 0,
      active: true,
      // Alice's turn ended with nothing accepted: a session, not a contributor.
      sessions: 2,
      contributors: 0,
    });
  });

  it("never lets a cache keep an identified answer", async () => {
    const api = await opened();
    for (const path of ["/queue/me", "/link", "/session/result/shield"]) {
      // oxlint-disable-next-line no-await-in-loop -- one route at a time
      expect((await api("GET", path, ALICE)).headers.get("cache-control")).toBe("no-store");
    }
  });
});
