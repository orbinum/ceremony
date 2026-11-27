/**
 * The verifier's HTTP face under raw, malformed and hostile requests: exact-path routing,
 * Content-Length anomalies, smuggling shapes, slow sockets, the connection cap, a throwing sink.
 * Idle sockets can hold the 32 slots only until the header bound (5 s, checked each second) drops
 * them.
 */
import type { Server } from "node:http";
import { connect, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import type { JobSpec } from "@orbinum-ceremony/core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createVerifierServer, type JobSink } from "../../../src/service";
import { CEREMONY_ID, HMAC_KEY, jobSpec, signedDispatch, within } from "../../support";

const GENESIS = { sha256: "11".repeat(32), csHash: "00".repeat(64) };

let port = 0;
const open = () =>
  new Promise<Socket>((resolve, reject) => {
    const s = connect(port, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });

const exchange = (text: string, ms = 8_000) =>
  within(
    ms,
    "raw exchange",
    new Promise<string>((resolve) => {
      const s = connect(port, "127.0.0.1", () => s.write(text));
      let out = "";
      s.on("data", (d) => (out += d.toString()));
      s.on("close", () => resolve(out));
      s.on("error", () => resolve(out));
    }),
  );

const statusOf = (out: string) => Number(/^HTTP\/1\.1 (\d{3})/.exec(out)?.[1] ?? 0);

describe("verifier http under hostile requests", () => {
  const submitted: JobSpec[] = [];
  let throwOnSubmit = false;
  const sink: JobSink = {
    submit: (spec) => {
      if (throwOnSubmit) throw new Error("sink exploded");
      submitted.push(spec);
      return "queued";
    },
    healthy: () => true,
  };
  let server: Server;
  let url = "";
  const body = JSON.stringify(jobSpec(1, GENESIS));

  beforeAll(async () => {
    server = createVerifierServer({ hmacKey: HMAC_KEY, ceremonyId: CEREMONY_ID }, sink);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    url = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  afterEach(() => {
    submitted.length = 0;
    throwOnSubmit = false;
  });

  const signedRaw = (path: string, extra = "") => {
    const h: Record<string, string> = signedDispatch(body);
    return (
      `POST ${path} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n` +
      `x-ceremony-timestamp: ${h["x-ceremony-timestamp"]}\r\n` +
      `x-ceremony-signature: ${h["x-ceremony-signature"]}\r\n` +
      `x-ceremony-body-sha256: ${h["x-ceremony-body-sha256"]}\r\n` +
      `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n${extra}\r\n${body}`
    );
  };

  it("routes only the exact /verify: other spellings of a signed dispatch are 404", async () => {
    for (const path of [
      "/verify/",
      "/verify?x=1",
      "//verify",
      "/VERIFY",
      "/%76erify",
      "/./verify",
      "/x/../verify",
      "http://evil/verify",
    ]) {
      const out = await exchange(signedRaw(path));
      expect([path, statusOf(out)]).toEqual([path, 404]);
    }
    expect(submitted).toEqual([]);
    expect(statusOf(await exchange(signedRaw("/verify")))).toBe(202);
    expect(submitted).toHaveLength(1);
  });

  it.each([
    ["a negative Content-Length", "Content-Length: -1\r\n"],
    ["a signed Content-Length", "Content-Length: +5\r\n"],
    ["a non-numeric Content-Length", "Content-Length: 1e3\r\n"],
    ["two differing Content-Lengths", "Content-Length: 2\r\nContent-Length: 3\r\n"],
    [
      "Content-Length together with chunked (smuggling)",
      "Content-Length: 5\r\nTransfer-Encoding: chunked\r\n",
    ],
    ["an obfuscated Transfer-Encoding", "Transfer-Encoding: xchunked\r\n"],
  ])("answers %s with a 4xx and keeps serving", async (_, headers) => {
    const out = await exchange(
      `POST /verify HTTP/1.1\r\nHost: x\r\nx-ceremony-timestamp: 1\r\n` +
        `x-ceremony-signature: ${"ab".repeat(32)}\r\n${headers}Connection: close\r\n\r\n{}`,
    );
    const status = statusOf(out);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    expect(submitted).toEqual([]);
  });

  it("turns a sink that throws into a 400, never an unhandled rejection or a crash", async () => {
    const unhandled = vi.fn<(reason: unknown) => void>();
    process.on("unhandledRejection", unhandled);
    throwOnSubmit = true;
    try {
      const r = await fetch(`${url}/verify`, {
        method: "POST",
        headers: signedDispatch(body),
        body,
      });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "unreadable body" });
      await new Promise((r2) => setTimeout(r2, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect((await fetch(`${url}/healthz`)).status).toBe(200);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("answers /healthz with {ok} only: no version, ceremony, queue length or server header", async () => {
    const r = await fetch(`${url}/healthz`);
    expect(await r.text()).toBe('{"ok":true}');
    expect(r.headers.get("server")).toBeNull();
    expect(r.headers.get("x-powered-by")).toBeNull();
    for (const path of ["/healthz/", "/healthz?verbose=1"]) {
      expect((await fetch(`${url}${path}`)).status).toBe(404);
    }
    expect((await fetch(`${url}/healthz`, { method: "HEAD" })).status).toBe(404);
  });

  it("drops a socket that never finishes its headers within ~5 s (slowloris)", async () => {
    const s = await open();
    s.write("POST /verify HTTP/1.1\r\nHost: x\r\nx-ceremony-timestamp: 1\r\n");
    const drip = setInterval(() => s.writable && s.write("x-a: b\r\n"), 500);
    const start = Date.now();
    await within(12_000, "slowloris close", new Promise((r) => s.on("close", r)));
    clearInterval(drip);
    const took = Date.now() - start;
    expect(took).toBeLessThan(8_000);
  }, 15_000);

  it("drops a socket that dribbles a body past the 10 s request bound", async () => {
    const s = await open();
    s.write(
      `POST /verify HTTP/1.1\r\nHost: x\r\nx-ceremony-timestamp: 1\r\n` +
        `x-ceremony-signature: ${"ab".repeat(32)}\r\nContent-Length: 1000\r\n\r\n`,
    );
    const drip = setInterval(() => s.writable && s.write("x"), 1_000);
    const start = Date.now();
    await within(15_000, "dribbled body close", new Promise((r) => s.on("close", r)));
    clearInterval(drip);
    expect(Date.now() - start).toBeLessThan(13_000);
  }, 20_000);

  it("lets 32 idle unauthenticated sockets lock a dispatch out only until they are dropped", async () => {
    const sockets = await Promise.all(Array.from({ length: 32 }, () => open()));
    for (const s of sockets) s.write("POST /verify HTTP/1.1\r\nHost: x\r\n");
    await new Promise((r) => setTimeout(r, 200));
    const locked = await fetch(`${url}/verify`, {
      method: "POST",
      headers: signedDispatch(body),
      body,
    }).then(
      (r) => r.status,
      () => "refused",
    );
    expect(locked).toBe("refused");
    await within(
      10_000,
      "slots freed",
      Promise.all(sockets.map((s) => new Promise((r) => (s.destroyed ? r(0) : s.on("close", r))))),
    );
    const r = await fetch(`${url}/verify`, {
      method: "POST",
      headers: signedDispatch(body),
      body,
    });
    expect(r.status).toBe(202);
  }, 20_000);
});
