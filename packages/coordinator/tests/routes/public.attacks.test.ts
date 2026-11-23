/**
 * Attacks on the public reads (SPEC §6.1): traversal and encodings on `/artifacts/*`, inert headers,
 * receipt ids, and percent-encoded spellings against the edge cache key.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appWith,
  call,
  clearBuckets,
  freshId,
  json,
  raw,
  refusal,
  setupInput,
  stubOf,
} from "../support";

beforeEach(clearBuckets);

describe("/artifacts/*", () => {
  it("serves only the public bucket, whatever the traversal or encoding", async () => {
    await env.PRIVATE.put("verify/1/shield/1-secret.zkey", "private bytes");
    await env.PUBLIC.put("ceremony.json", "{}", { httpMetadata: { contentType: "text/html" } });
    for (const path of [
      "/artifacts/verify/1/shield/1-secret.zkey",
      "/artifacts/..%2fverify/1/shield/1-secret.zkey",
      "/artifacts/%2e%2e/%2e%2e/verify/1/shield/1-secret.zkey",
      "/artifacts/..%5cceremony.json",
      "/artifacts/%252e%252e/ceremony.json",
      "/artifacts/CEREMONY.JSON",
      "/artifacts/ceremony.json%00",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one path at a time
      const r = await raw(path);
      expect([path, r.status]).toEqual([path, 404]);
    }
  });

  it("answers a key longer than R2 allows as not found, not as a storage failure", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await refusal(await raw(`/artifacts/${"a".repeat(1025)}`))).toEqual([404, "not-found"]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("sends nosniff and the sandbox CSP on files and on errors", async () => {
    await env.PUBLIC.put("ceremony.json", "<script>alert(1)</script>", {
      httpMetadata: { contentType: "text/html" },
    });
    const ok = await raw("/artifacts/ceremony.json");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    const head = await raw("/artifacts/ceremony.json", { method: "HEAD" });
    expect(head.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    const missing = await raw("/artifacts/nope.html");
    expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
    expect(missing.headers.get("content-type")).toMatch(/^application\/json/);
    // Error answers are our fixed JSON, with the same inert headers.
    expect(missing.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it("refuses writes on /artifacts", async () => {
    for (const method of ["PUT", "POST", "DELETE"]) {
      // oxlint-disable-next-line no-await-in-loop -- one method at a time
      const r = await raw("/artifacts/ceremony.json", {
        method,
        body: method === "DELETE" ? undefined : "x",
      });
      expect(r.status).toBe(404);
    }
    expect(await env.PUBLIC.head("ceremony.json")).toBeNull();
  });
});

describe("/api/receipt/:seq", () => {
  it("refuses 0, negative, huge, fractional, padded and exponent ids", async () => {
    const name = freshId("receipt-attacks");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    for (const seq of [
      "0",
      "-1",
      "00",
      "01",
      "1.5",
      "1e0",
      "4294967296",
      "99999999999",
      "0x1",
      "%20%31",
      "1%20",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one id at a time
      const r = await call("GET", `/api/receipt/${seq}`, undefined, { ceremony: name });
      // oxlint-disable-next-line no-await-in-loop -- one id at a time
      expect([seq, ...(await refusal(r))]).toEqual([seq, 400, "malformed"]);
    }
    expect(
      await refusal(await call("GET", "/api/receipt/4294967295", undefined, { ceremony: name })),
    ).toEqual([404, "not-found"]);
  });
});

let hosts = 0;
/** The app with the edge cache on, on a host of its own, routed to a counting stub of `name`. */
function counted(name: string) {
  const host = `https://cache-${++hosts}-${Date.now()}.example`;
  const calls = { snapshot: 0, receipt: 0 };
  const stub = stubOf(name);
  const proxy = new Proxy(stub, {
    get(target, prop) {
      if (prop === "snapshot" || prop === "receipt") {
        return (...args: unknown[]) => {
          calls[prop] += 1;
          return (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop]?.(
            ...args,
          );
        };
      }
      return (target as unknown as Record<PropertyKey, unknown>)[prop];
    },
  });
  const get = (path: string) =>
    appWith(
      {
        PUBLIC_CACHE_SECONDS: "5",
        CEREMONY: { getByName: () => proxy } as unknown as Env["CEREMONY"],
      },
      `${host}${path}`,
      { headers: { "cf-connecting-ip": "192.0.2.77" } },
    );
  return { calls, get };
}

describe("edge cache", () => {
  it("serves one cache entry per path, whatever the query string", async () => {
    const name = freshId("cache-attacks");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(name));
    const { calls, get } = counted(name);
    for (const q of ["", "?a=1", "?a=2", "?#x"]) {
      // oxlint-disable-next-line no-await-in-loop -- one read at a time
      expect((await get(`/api/status${q}`)).status).toBe(200);
    }
    expect(calls.snapshot).toBe(1);
  });

  /**
   * The router matches the decoded path, so the cache key must too: otherwise every spelling of a
   * path, or every unknown id, would be a miss that reaches the ceremony's single object.
   */
  it("shares one cache entry between percent-encoded spellings, and caches an unknown receipt", async () => {
    const name = freshId("cache-attacks-bypass");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(name));
    const { calls, get } = counted(name);
    const spellings = [
      "/api/status",
      "/api/st%61tus",
      "/api/st%61t%75s",
      "/api/%73tatus",
      "/api/s%74a%74u%73",
    ];
    const answers = [];
    for (const p of spellings) {
      // oxlint-disable-next-line no-await-in-loop -- one read at a time
      const r = await get(p);
      answers.push(r.status);
      // oxlint-disable-next-line no-await-in-loop -- drain before the next read
      await r.arrayBuffer();
    }
    for (const seq of [101, 101, 101]) {
      // oxlint-disable-next-line no-await-in-loop -- one read at a time
      const r = await get(`/api/receipt/${seq}`);
      answers.push(r.status);
      // oxlint-disable-next-line no-await-in-loop -- drain before the next read
      await r.arrayBuffer();
    }
    expect(answers).toEqual([200, 200, 200, 200, 200, 404, 404, 404]);
    expect(calls).toEqual({ snapshot: 1, receipt: 1 });
    // Case and trailing slashes are not the route.
    expect((await get("/API/status")).status).toBe(404);
    expect((await get("/api/status/")).status).toBe(404);
    expect(await json(await get("/api/status"))).toMatchObject({ phase: "OPEN" });
  });
});
