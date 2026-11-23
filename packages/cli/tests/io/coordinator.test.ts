/**
 * The coordinator's admin API: only its own answers count, the Access token stays on https, and a
 * call lost to the network or the coordinator's fault is sent again (every operator call is
 * idempotent), a refusal never.
 */
import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminRefusal, adminCall } from "../../src/io";
import { accessHeaders } from "../../src/io/coordinator";
import { rejection } from "../support/errors";
import { json, localServer } from "../support/http";

let server: Awaited<ReturnType<typeof localServer>>;
let elsewhere: Awaited<ReturnType<typeof localServer>>;
/** Failures each flaky route still has to give before it answers ok. */
const failuresLeft = new Map<string, number>();
/** Retries without the production backoff. */
const FAST = { attempts: 3, backoffMs: 1 };
const callsTo = (path: string) => server.requests.filter((r) => r.path === path).length;

/** Fails `n` times with `fail`, then answers ok. */
const flaky =
  (path: string, fail: (res: ServerResponse) => void) => (_q: unknown, res: ServerResponse) => {
    const left = failuresLeft.get(path) ?? 0;
    if (left > 0) {
      failuresLeft.set(path, left - 1);
      fail(res);
    } else json(res, 201, { ok: true, key: "k" });
  };

beforeAll(async () => {
  elsewhere = await localServer({ "*": (_q, res) => json(res, 200, { ok: true, key: "x" }) });
  server = await localServer({
    "/ok": (_q, res) => json(res, 201, { ok: true, key: "k" }),
    "/redirect": (_q, res) => res.writeHead(302, { location: `${elsewhere.url}/steal` }).end(),
    "/login": (_q, res) =>
      res.writeHead(200, { "content-type": "text/html" }).end("<html>Sign in</html>"),
    "/not-ok": (_q, res) => json(res, 200, { ok: false }),
    "/refused": (_q, res) =>
      json(res, 409, { error: { code: "immutable", message: `\u001b[2K${"x".repeat(5000)}` } }),
    "/unavailable": flaky("/unavailable", (res) =>
      json(res, 503, { error: { code: "storage", message: "try again" } }),
    ),
    // What wrangler dev's ProxyWorker answers when it loses its connection to the Worker.
    "/proxy-lost": flaky("/proxy-lost", (res) =>
      res.writeHead(500, { "content-type": "text/plain" }).end("Error: Network connection lost."),
    ),
    "/dropped": flaky("/dropped", (res) => res.socket?.destroy()),
  });
});
afterAll(async () => {
  await server.close();
  await elsewhere.close();
});

describe("the coordinator's admin API", () => {
  it("returns the coordinator's own ok answer, without the Access token over plaintext", async () => {
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      expect(await adminCall(server.url, "PUT", "/ok", {}, "x")).toEqual({ ok: true, key: "k" });
      const sent = server.requests.at(-1)?.headers ?? {};
      expect(sent["cf-access-client-secret"]).toBeUndefined();
      expect(sent["cf-access-client-id"]).toBeUndefined();
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
  });

  it("sends the Access token to an https origin only", () => {
    const env = { CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" };
    expect(accessHeaders("https://coordinator.example", env)).toEqual({
      "cf-access-client-id": "id",
      "cf-access-client-secret": "secret",
    });
    expect(accessHeaders("http://127.0.0.1:8787", env)).toEqual({});
    expect(accessHeaders("https://coordinator.example", { CF_ACCESS_CLIENT_ID: "id" })).toEqual({});
  });

  it("never follows a redirect, so the Access secret goes nowhere else", async () => {
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      await expect(adminCall(server.url, "PUT", "/redirect", {}, "x")).rejects.toThrow(
        /fetch failed/,
      );
      expect(elsewhere.requests).toEqual([]);
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
  });

  it("does not take a 200 that is not the coordinator's ok answer as success", async () => {
    await expect(adminCall(server.url, "POST", "/login", {}, "{}")).rejects.toThrow(
      /not a JSON answer/,
    );
    await expect(adminCall(server.url, "POST", "/not-ok", {}, "{}")).rejects.toThrow(
      /did not answer ok/,
    );
  });

  it("reports a refusal with a bounded, terminal-safe body", async () => {
    const error = await rejection(adminCall(server.url, "PUT", "/refused", {}, "x"));
    expect(error).toBeInstanceOf(AdminRefusal);
    expect(error).toMatchObject({ status: 409, code: "immutable" });
    expect(error.message).toMatch(/^PUT \/refused: 409 /);
    expect(error.message.includes("\u001b")).toBe(false);
    expect(error.message.length).toBeLessThan(600);
  });
});

describe("retries", () => {
  it.each(["/unavailable", "/proxy-lost", "/dropped"])(
    "sends %s again until the coordinator answers",
    async (path) => {
      failuresLeft.set(path, 2);
      expect(await adminCall(server.url, "PUT", path, {}, "bytes", FAST)).toEqual({
        ok: true,
        key: "k",
      });
      expect(callsTo(path)).toBe(3);
    },
  );

  it("gives up after its attempts, with the last failure", async () => {
    failuresLeft.set("/unavailable", 10);
    const before = callsTo("/unavailable");
    const error = await rejection(adminCall(server.url, "PUT", "/unavailable", {}, "x", FAST));
    expect(error).toMatchObject({ status: 503, code: "storage" });
    expect(callsTo("/unavailable") - before).toBe(FAST.attempts);
    failuresLeft.delete("/unavailable");
  });

  it("never sends a refusal or a redirect again", async () => {
    const refused = callsTo("/refused");
    await expect(adminCall(server.url, "PUT", "/refused", {}, "x", FAST)).rejects.toThrow(
      AdminRefusal,
    );
    expect(callsTo("/refused") - refused).toBe(1);
    const redirected = callsTo("/redirect");
    await expect(adminCall(server.url, "PUT", "/redirect", {}, "x", FAST)).rejects.toThrow(
      /fetch failed/,
    );
    expect(callsTo("/redirect") - redirected).toBe(1);
  });
});
