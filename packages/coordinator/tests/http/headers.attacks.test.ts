/**
 * Attacks response headers and error answers: security headers on every answer, no caching of
 * identified reads, no internal message or stack in an error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { appWith, call, json } from "../support";

const SECURITY = {
  "strict-transport-security": /max-age=\d{7,}/,
  "x-content-type-options": /^nosniff$/,
  "x-frame-options": /^SAMEORIGIN$/,
  "referrer-policy": /^no-referrer$/,
  "cross-origin-resource-policy": /^same-origin$/,
};
const missingSecurityHeaders = (r: Response) =>
  Object.entries(SECURITY)
    .filter(([name, re]) => !re.test(r.headers.get(name) ?? ""))
    .map(([name]) => name);

describe("security headers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("are on successes, refusals, not-found, malformed and configuration errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const answers = [
      await call("GET", "/api/status"),
      await call("GET", "/nothing"),
      await call("GET", "/api/link"),
      await call("POST", "/api/link", 9301, { body: "x", headers: {} }),
      await appWith({ SESSION_KEY: "short" }, "http://localhost/api/status"),
      await call("GET", "/auth/github"),
    ];
    expect(answers.map(missingSecurityHeaders)).toEqual(answers.map(() => []));
  });

  it("leave Content-Security-Policy off JSON API answers", async () => {
    const r = await call("GET", "/api/status");
    expect(r.headers.get("content-security-policy")).toBeNull();
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
  });

  it("serve public files inert", async () => {
    const r = await call("GET", "/artifacts/nothing.html");
    expect(r.status).toBe(404);
    expect(missingSecurityHeaders(r)).toEqual([]);
  });
});

describe("caching of identified answers", () => {
  it("marks identified reads no-store", async () => {
    for (const path of ["/api/link", "/api/queue/me", "/api/session/result/shield"]) {
      const r = await call("GET", path, 9302);
      expect([path, r.headers.get("cache-control")]).toEqual([path, "no-store"]);
    }
  });

  it("marks the head view no-store and leaves the sign-in redirect without cache-control", async () => {
    expect((await call("GET", "/api/session/head/shield", 9303)).headers.get("cache-control")).toBe(
      "no-store",
    );
    expect((await call("GET", "/auth/github")).headers.get("cache-control")).toBeNull();
  });
});

describe("error answers leak nothing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers an unexpected throw as `internal error`, without its message or stack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exploding = {
      CEREMONY: {
        getByName: () => {
          throw new Error("SECRET-DETAIL at /src/durable/object/ceremony.ts:42");
        },
      } as unknown as Env["CEREMONY"],
    };
    const r = await appWith(exploding, "http://localhost/api/status", {
      headers: { "cf-connecting-ip": "10.99.0.1" },
    });
    const text = await r.text();
    expect([r.status, text]).toEqual([
      500,
      JSON.stringify({ error: { code: "internal", message: "internal error" } }),
    ]);
    expect(missingSecurityHeaders(r)).toEqual([]);
  });

  it("answers malformed JSON without the parser's message", async () => {
    const r = await appWith({}, "http://localhost/api/link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dev-github-id": "9304" },
      body: '{"scheme":',
    });
    expect([r.status, await json(r)]).toEqual([
      400,
      { error: { code: "malformed", message: "malformed" } },
    ]);
  });

  it("echoes a rejected artifact path only inside a JSON message", async () => {
    const r = await call("PUT", "/admin/artifacts/%3Cscript%3E", undefined, {
      headers: { "content-length": "1", "x-content-sha256": "00".repeat(32) },
    });
    const body = await json(r);
    expect(r.status).toBe(400);
    expect(String(body.error.message)).toContain("%3Cscript%3E");
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
  });
});
