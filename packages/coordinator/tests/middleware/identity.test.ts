/**
 * Who is calling (SPEC §3.2, KL-29): a valid session cookie of this ceremony first; the
 * development header only in a local run on a loopback host, and only as a safe positive id.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  appWith,
  call,
  freshId,
  json,
  linkDirect,
  refusal,
  routedTo,
  sessionCookie,
  setupInput,
  stubOf,
} from "../support";

const HOST = "https://ceremony.example";
const DEV = (id: string) => ({ "x-dev-github-id": id, "x-dev-github-login": "dev" });
const me = (patch: Partial<Env>, url: string, headers: Record<string, string>) =>
  appWith(patch, url, { headers });

describe("who is calling", () => {
  it("accepts the development identity only in a local run on a loopback host", async () => {
    const local = await call("GET", "/api/link", 4001);
    expect([local.status, await json(local)]).toEqual([200, { linked: null }]);
    for (const [patch, url] of [
      [{ ENVIRONMENT: "production" }, "http://localhost/api/link"],
      [{ ENVIRONMENT: "testnet" }, "http://127.0.0.1/api/link"],
      [{ ENVIRONMENT: "local" }, `${HOST}/api/link`],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one environment at a time
      const r = await me(patch, url, DEV("4001"));
      // oxlint-disable-next-line no-await-in-loop -- one environment at a time
      expect([r.status, (await json(r)).error.code]).toEqual([401, "unauthenticated"]);
    }
  });

  it("refuses development ids that are not positive integers", async () => {
    for (const id of ["0", "-1", "1.5", "abc", "01", "99999999999999999", "9999999999999999"]) {
      // oxlint-disable-next-line no-await-in-loop -- one id at a time
      const r = await me({}, "http://localhost/api/link", DEV(id));
      // oxlint-disable-next-line no-await-in-loop -- one id at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
    const largest = await me({}, "http://localhost/api/link", DEV(String(Number.MAX_SAFE_INTEGER)));
    expect(largest.status).toBe(200);
  });

  it("takes a valid session cookie over the development header", async () => {
    const name = freshId("identity");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(name));
    const wallet = await linkDirect(stubOf(name), 4003);
    const r = await call("GET", "/api/link", 4002, { ceremony: name, cookie: sessionCookie(4003) });
    expect([r.status, (await json(r)).linked?.account]).toEqual([200, wallet.address]);
    const linked = await appWith(
      { ENVIRONMENT: "production", ...routedTo(name) },
      `${HOST}/api/link`,
      { headers: { cookie: sessionCookie(4003), ...DEV("4002") } },
    );
    expect((await json(linked)).linked?.account).toBe(wallet.address);
  });

  it("refuses an expired, tampered, foreign-scope, foreign-ceremony or foreign-key cookie", async () => {
    const valid = sessionCookie(4004);
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("0") ? "1" : "0"}`;
    for (const cookie of [
      sessionCookie(4004, "user-4004", { now: Date.now() - 120_000 }),
      tampered,
      sessionCookie(4004, "user-4004", { scope: `oauth-state:${env.CEREMONY_ID}` }),
      sessionCookie(4004, "user-4004", { scope: "session:mainnet-1" }),
      sessionCookie(4004, "user-4004", { key: "another-session-key-of-32-bytes!!" }),
      sessionCookie(4004, "-bad-login-"),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one cookie at a time
      const r = await appWith({ ENVIRONMENT: "production" }, `${HOST}/api/link`, {
        headers: { cookie },
      });
      // oxlint-disable-next-line no-await-in-loop -- one cookie at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
    const ok = await appWith({ ENVIRONMENT: "production" }, `${HOST}/api/link`, {
      headers: { cookie: valid },
    });
    expect(ok.status).toBe(200);
  });

  it("refuses to sign anything with a session key shorter than 32 bytes", async () => {
    const r = await appWith(
      { ENVIRONMENT: "production", SESSION_KEY: "short" },
      `${HOST}/api/link`,
      {
        headers: { cookie: sessionCookie(4005) },
      },
    );
    expect(r.status).toBe(500);
    expect(await json(r)).toEqual({ error: { code: "internal", message: "internal error" } });
  });
});
