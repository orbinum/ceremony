/**
 * Attacks the local-run privileges with near-miss environments and hosts: the development identity,
 * `/admin` without Access and joining without Turnstile need exactly `local` on loopback, and an
 * unknown ENVIRONMENT never reaches a route.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ENVIRONMENTS, isLocal } from "../../src/env";
import {
  appWith,
  freshId,
  linkDirect,
  refusal,
  routedTo,
  sessionCookie,
  setupInput,
  stubOf,
} from "../support";

const NEAR_MISS_ENVS: (string | undefined)[] = [
  "Local",
  "LOCAL",
  "local ",
  " local",
  "local\n",
  "",
  undefined,
  "dev",
  "development",
  "test",
  "production",
];
const NON_LOOPBACK_HOSTS = [
  "http://localhost.",
  "http://0.0.0.0",
  "http://127.0.0.2",
  "http://[::ffff:127.0.0.1]",
  "http://[::]",
  "http://localhost.evil.example",
  "http://evil.example",
  "https://ceremony.example",
  "http://127.0.0.1.nip.io",
];
const LOOPBACK_SPELLINGS = [
  "http://LOCALHOST",
  "http://localhost:8787",
  "http://127.1",
  "http://0x7f000001",
  "http://2130706433",
  "http://[0:0:0:0:0:0:0:1]",
];

const envOf = (ENVIRONMENT: string | undefined) => ({ ENVIRONMENT }) as unknown as Env;

describe("isLocal", () => {
  it("is false for every environment that is not exactly `local`", () => {
    for (const e of NEAR_MISS_ENVS) {
      expect([e, isLocal(envOf(e), "http://localhost/")]).toEqual([e, false]);
    }
  });

  it("is false on any host that is not a listed loopback name", () => {
    for (const h of NON_LOOPBACK_HOSTS) {
      expect([h, isLocal(envOf("local"), `${h}/`)]).toEqual([h, false]);
    }
  });

  it("is true for spellings the URL parser normalizes to a loopback name (genuinely loopback)", () => {
    for (const h of LOOPBACK_SPELLINGS) {
      expect([h, isLocal(envOf("local"), `${h}/`)]).toEqual([h, true]);
    }
  });
});

const DEV = { "x-dev-github-id": "9101", "x-dev-github-login": "dev" };
const NOT_LOCAL: [string | undefined, string][] = [
  ...NEAR_MISS_ENVS.map((e) => [e, "http://localhost"] as [string | undefined, string]),
  ...NON_LOOPBACK_HOSTS.map((h) => ["local", h] as [string, string]),
];

const refusedAs = (env: string | undefined, status: number, code: string) =>
  (ENVIRONMENTS as readonly (string | undefined)[]).includes(env)
    ? [status, code]
    : [500, "internal"];

describe("local privileges are unreachable outside a local run", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses the development identity header", async () => {
    for (const [ENVIRONMENT, base] of NOT_LOCAL) {
      const r = await appWith({ ENVIRONMENT } as Partial<Env>, `${base}/api/link`, {
        headers: { ...DEV, "cf-connecting-ip": "10.77.0.1" },
      });
      expect([ENVIRONMENT, base, ...(await refusal(r))]).toEqual([
        ENVIRONMENT,
        base,
        ...refusedAs(ENVIRONMENT, 401, "unauthenticated"),
      ]);
    }
  });

  it("refuses /admin without an Access token (operator header present)", async () => {
    const fetches = vi.spyOn(globalThis, "fetch");
    for (const [ENVIRONMENT, base] of NOT_LOCAL) {
      const r = await appWith({ ENVIRONMENT } as Partial<Env>, `${base}/admin/state`, {
        method: "POST",
        headers: { "x-ceremony-operator": "1", "content-type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      expect([ENVIRONMENT, base, ...(await refusal(r))]).toEqual([
        ENVIRONMENT,
        base,
        ...refusedAs(ENVIRONMENT, 403, "forbidden"),
      ]);
    }
    expect(fetches).not.toHaveBeenCalled();
  });

  describe("Turnstile", () => {
    let name: string;
    beforeAll(async () => {
      name = freshId("local-attacks");
      await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
      await runDurableObjectAlarm(stubOf(name));
      await linkDirect(stubOf(name), 9102);
    });

    it("is required to join, with a session, in every near-miss environment and host", async () => {
      const siteverify = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => Response.json({ success: false }));
      for (const [ENVIRONMENT, base] of NOT_LOCAL) {
        const r = await appWith(
          { ENVIRONMENT, ...routedTo(name) } as Partial<Env>,
          `${base}/api/queue/join`,
          {
            method: "POST",
            headers: { cookie: sessionCookie(9102), "cf-connecting-ip": "10.77.0.2" },
          },
        );
        expect([ENVIRONMENT, base, ...(await refusal(r))]).toEqual([
          ENVIRONMENT,
          base,
          ...refusedAs(ENVIRONMENT, 403, "turnstile"),
        ]);
      }
      expect(siteverify).not.toHaveBeenCalled();
    });
  });
});
