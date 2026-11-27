/**
 * Public reads and artifacts: one error shape, the edge cache keyed by origin and path only,
 * immutable caching only for files that never change, inert bytes, and a failed bucket or object
 * answered without internals.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  appWith,
  call,
  freshId,
  json,
  PUBLIC,
  raw,
  refusal,
  routedTo,
  setupInput,
  stubOf,
} from "../../../support";

describe("before the ceremony is configured", () => {
  it("answers not-configured, in the one error shape", async () => {
    const name = freshId("views-unconfigured");
    for (const path of ["/api/status", "/api/transcript"]) {
      const r = await call("GET", path, undefined, { ceremony: name });
      expect([r.status, await json(r)]).toEqual([
        503,
        { error: { code: "not-configured", message: "not-configured" } },
      ]);
    }
    expect(await refusal(await call("GET", "/api/queue/me", 6001, { ceremony: name }))).toEqual([
      503,
      "not-configured",
    ]);
  });
});

let hosts = 0;
const cachedRead = (name: string) => {
  const host = `https://cache-${++hosts}-${Date.now()}.example`;
  return (query = "") =>
    appWith({ PUBLIC_CACHE_SECONDS: "5", ...routedTo(name) }, `${host}/api/status${query}`, {
      headers: { "cf-connecting-ip": "192.0.2.1" },
    });
};

describe("public reads", () => {
  it("refuses a receipt id that is not a decimal id", async () => {
    const name = freshId("views-receipt");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    for (const seq of ["abc", "-1", "01", "1e3"]) {
      const r = await call("GET", `/api/receipt/${seq}`, undefined, { ceremony: name });
      expect(await refusal(r)).toEqual([400, "malformed"]);
    }
    const missing = await call("GET", "/api/receipt/99", undefined, { ceremony: name });
    expect(await refusal(missing)).toEqual([404, "not-found"]);
  });

  it("is served from the edge cache for a few seconds, whatever the query string", async () => {
    const name = freshId("views-cache");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stubOf(name));
    const read = cachedRead(name);
    const first = await read();
    expect(first.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=5");
    const body = await first.json();
    expect(body).toMatchObject({ phase: "OPEN" });
    await stubOf(name).apply({ type: "pause" });
    for (const query of ["", "?b=1", "?phase=x&b=2"]) {
      const r = await read(query);
      expect([r.status, await r.json()]).toEqual([200, body]);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=5");
    }
  });

  it("never lets a browser keep a hit, whatever max-age the edge stored it with", async () => {
    const name = freshId("views-browser-ttl");
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    const read = cachedRead(name);
    const stale = new Response("{}", { headers: { "cache-control": "public, max-age=14400" } });
    const match = vi.spyOn(caches.default, "match").mockResolvedValueOnce(stale);
    try {
      expect((await read()).headers.get("cache-control")).toBe("public, max-age=0, s-maxage=5");
    } finally {
      match.mockRestore();
    }
  });

  it("never caches a refusal", async () => {
    const name = freshId("views-nocache");
    const read = cachedRead(name);
    expect(await refusal(await read())).toEqual([503, "not-configured"]);
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    expect((await read()).status).toBe(200);
  });

  it("sends the security headers on every answer", async () => {
    const r = await call("GET", "/api/status");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age=/);
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

describe("artifacts", () => {
  it("serves bytes as inert content, and refuses keys that are not keys", async () => {
    await PUBLIC.put("status.json", "{}");
    const r = await call("GET", "/artifacts/status.json");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    for (const path of ["/artifacts/%E0%A4%A", "/artifacts/", "/artifacts/nope"]) {
      expect(await refusal(await raw(path))).toEqual([404, "not-found"]);
    }
  });

  it("caches for good only the genesis keys, frozen before any contribution", async () => {
    const immutable = ["genesis/shield.genesis.zkey"];
    const revalidated = [
      "contributions/shield/1.zkey",
      "logs/shield/1.log",
      "transcript.json",
      "status.json",
      "ceremony.json",
      "final/shield.vk.json",
    ];
    for (const key of [...immutable, ...revalidated]) {
      await PUBLIC.put(key, "x", { httpMetadata: { cacheControl: "public, max-age=99" } });
    }
    for (const key of immutable) {
      const r = await raw(`/artifacts/${key}`);
      expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
    for (const key of revalidated) {
      const r = await raw(`/artifacts/${key}`);
      expect(r.headers.get("cache-control")).toBe("no-cache");
    }
  });

  it("answers 304 without the bytes when the reader's ETag is current, and the bytes otherwise", async () => {
    await PUBLIC.put("contributions/shield/1.zkey", "bytes");
    const first = await raw("/artifacts/contributions/shield/1.zkey");
    const etag = first.headers.get("etag") ?? "";
    expect([first.status, await first.text()]).toEqual([200, "bytes"]);
    const again = await raw("/artifacts/contributions/shield/1.zkey", {
      headers: { "if-none-match": etag },
    });
    expect([again.status, await again.text(), again.headers.get("etag")]).toEqual([304, "", etag]);
    await PUBLIC.put("contributions/shield/1.zkey", "other");
    const replaced = await raw("/artifacts/contributions/shield/1.zkey", {
      headers: { "if-none-match": etag },
    });
    expect([replaced.status, await replaced.text()]).toEqual([200, "other"]);
    const ifMatch = await raw("/artifacts/contributions/shield/1.zkey", {
      headers: { "if-match": '"nope"' },
    });
    expect(ifMatch.status).toBe(200);
  });

  it("answers a failed bucket as storage, and an unexpected error without internals", async () => {
    const failing = { get: () => Promise.reject(new Error("secret internals")) };
    const storage = await appWith(
      { PUBLIC: failing as unknown as R2Bucket },
      "http://localhost/artifacts/x",
    );
    expect([storage.status, await json(storage)]).toEqual([
      503,
      { error: { code: "storage", message: "storage unavailable; try again" } },
    ]);
    expect(await refusal(await raw("/nope"))).toEqual([404, "not-found"]);
    const broken = await appWith(
      {
        CEREMONY: {
          getByName: () => {
            throw new Error("secret internals");
          },
        } as unknown as Env["CEREMONY"],
      },
      "http://localhost/api/transcript",
      { headers: { "cf-connecting-ip": "192.0.2.2" } },
    );
    expect([broken.status, await json(broken)]).toEqual([
      500,
      { error: { code: "internal", message: "internal error" } },
    ]);
  });
});
