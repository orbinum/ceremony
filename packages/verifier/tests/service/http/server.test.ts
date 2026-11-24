/**
 * The HTTP face (COORDINATOR §5): auth bound to the pinned ceremony and size checked before the
 * body, routing, answers that never quote the body, and connection slots that unauthenticated
 * sockets cannot hold.
 */
import { Agent, request, type Server } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { type JobSpec, MAX_JOB_SPEC_BYTES, REQUEST_AUTH } from "@orbinum-ceremony/core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createVerifierServer, type JobSink } from "../../../src/service";
import { CEREMONY_ID, HMAC_KEY, jobSpec, signedDispatch, within } from "../../support";

const GENESIS = { sha256: "11".repeat(32), csHash: "00".repeat(64) };

/** The fixed bound on any one request of this suite: a regression fails, never hangs. */
const BOUND_MS = 10_000;

const listen = async (server: Server) => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const close = (server: Server) => {
  server.closeAllConnections();
  return new Promise((r) => server.close(r));
};

/** A `POST /verify` with the given headers (signed for `CEREMONY_ID` by default). */
const post = (url: string, body: string, headers = signedDispatch(body)) =>
  within(BOUND_MS, "POST /verify", fetch(`${url}/verify`, { method: "POST", headers, body }));

/** A raw request: headers sent, then `send` decides what (if anything) follows. */
const raw = (
  url: string,
  headers: Record<string, string | number>,
  send: (req: ReturnType<typeof request>) => void,
) =>
  within(
    BOUND_MS,
    "raw POST /verify",
    new Promise<{ status: number; body: string; connection?: string }>((resolve, reject) => {
      const req = request(`${url}/verify`, { method: "POST", headers }, (res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body, connection: res.headers.connection }),
        );
      });
      req.on("error", reject);
      send(req);
    }),
  );

const SHAPED = {
  // Fresh at each use: a stale timestamp is refused before anything else is looked at.
  get "x-ceremony-timestamp"() {
    return String(Date.now());
  },
  "x-ceremony-signature": "ab".repeat(32),
};

describe("service http", () => {
  const submitted: JobSpec[] = [];
  let healthy = true;
  const sink: JobSink = {
    submit: (spec) => (submitted.push(spec), "queued"),
    healthy: () => healthy,
  };
  let server: Server;
  let url = "";
  const body = JSON.stringify(jobSpec(1, GENESIS));

  beforeAll(async () => {
    server = createVerifierServer({ hmacKey: HMAC_KEY, ceremonyId: CEREMONY_ID }, sink);
    url = await listen(server);
  });
  afterAll(() => close(server));
  afterEach(() => {
    submitted.length = 0;
    healthy = true;
  });

  describe("auth and bounds", () => {
    it("takes a signed job with 202 and hands it on", async () => {
      const response = await post(url, body);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ accepted: "1/shield/1" });
      expect(submitted).toEqual([JSON.parse(body)]);
    });

    it.each([
      ["a wrong key", () => signedDispatch(body, CEREMONY_ID, `${HMAC_KEY}-wrong`)],
      [
        "another ceremony's MAC (a key reused across ceremonies)",
        () => signedDispatch(body, "another-ceremony"),
      ],
      [
        "a timestamp too far ahead",
        () => ({
          ...signedDispatch(body),
          "x-ceremony-timestamp": String(Date.now() + REQUEST_AUTH.skewMs + 5_000),
        }),
      ],
      ["another body signed", () => signedDispatch(`${body} `)],
    ])("refuses %s with 401", async (_, headers) => {
      const response = await post(url, body, headers());
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "bad signature" });
      expect(response.headers.get("connection")).toBe("close");
      expect(submitted).toEqual([]);
    });

    it("takes an authentic dispatch once: the same signed request again is a replay", async () => {
      const headers = signedDispatch(body);
      expect((await post(url, body, headers)).status).toBe(202);
      const replay = await post(url, body, headers);
      expect(replay.status).toBe(401);
      expect(await replay.json()).toEqual({ error: "replayed request" });
      expect(submitted).toHaveLength(1);
      // Signed anew (as every retry is), it reaches the sink, which acknowledges a repeat.
      await new Promise((r) => setTimeout(r, 2));
      expect((await post(url, body)).status).toBe(202);
      expect(submitted).toHaveLength(2);
    });

    it("refuses a timestamp too far behind, computed when sent", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        // Signed now, received skew + 5 s later.
        const headers = signedDispatch(body);
        vi.setSystemTime(Date.now() + REQUEST_AUTH.skewMs + 5_000);
        expect((await post(url, body, headers)).status).toBe(401);
      } finally {
        vi.useRealTimers();
      }
      expect(submitted).toEqual([]);
    });

    it.each([
      ["no headers", {}],
      ["no signature", { "x-ceremony-timestamp": "1700000000000" }],
      ["no timestamp", { "x-ceremony-signature": "ab".repeat(32) }],
      ["a non-decimal timestamp", { ...SHAPED, "x-ceremony-timestamp": "1e12" }],
      ["a 17-digit timestamp", { ...SHAPED, "x-ceremony-timestamp": "1".repeat(17) }],
      ["an uppercase signature", { ...SHAPED, "x-ceremony-signature": "AB".repeat(32) }],
      ["a short signature", { ...SHAPED, "x-ceremony-signature": "ab".repeat(31) }],
    ])("refuses %s with 401 before reading the body", async (_, headers) => {
      // The body is never sent: the answer must come from the headers alone.
      const res = await raw(url, { ...headers, "content-length": 100 }, (req) =>
        req.flushHeaders(),
      );
      expect(res).toEqual({ status: 401, body: '{"error":"bad signature"}', connection: "close" });
      expect(submitted).toEqual([]);
    });

    it("refuses forged headers with 401 before reading the body, whatever its size", async () => {
      const res = await raw(url, { ...SHAPED, "content-length": MAX_JOB_SPEC_BYTES + 1 }, (req) =>
        req.flushHeaders(),
      );
      expect(res).toEqual({ status: 401, body: '{"error":"bad signature"}', connection: "close" });
    });

    it("refuses an oversized Content-Length with 413 before reading the body, once signed", async () => {
      const big = "x".repeat(MAX_JOB_SPEC_BYTES + 1);
      const res = await raw(
        url,
        { ...signedDispatch(big), "content-length": MAX_JOB_SPEC_BYTES + 1 },
        (req) => req.flushHeaders(),
      );
      expect(res).toEqual({ status: 413, body: '{"error":"body too large"}', connection: "close" });
    });

    it("refuses a stale or future timestamp with 401 before reading the body", async () => {
      for (const at of [Date.now() - 61_000, Date.now() + 61_000]) {
        const headers = { ...SHAPED, "x-ceremony-timestamp": String(at) };
        // oxlint-disable-next-line no-await-in-loop -- one request at a time
        const res = await raw(
          url,
          { ...headers, "content-length": MAX_JOB_SPEC_BYTES + 1 },
          (req) => req.flushHeaders(),
        );
        expect(res.status).toBe(401);
      }
    });

    it("refuses an oversized chunked body with 413, once signed", async () => {
      const res = await raw(url, signedDispatch("x".repeat(MAX_JOB_SPEC_BYTES + 1)), (req) => {
        req.write("x".repeat(MAX_JOB_SPEC_BYTES));
        req.end("x");
      });
      expect(res).toMatchObject({ status: 413, body: '{"error":"body too large"}' });
    });

    it("survives an aborted request, and /healthz still answers 200", async () => {
      const unhandled = vi.fn<(reason: unknown) => void>();
      process.on("unhandledRejection", unhandled);
      try {
        await within(
          BOUND_MS,
          "aborted request",
          new Promise<void>((resolve) => {
            const req = request(`${url}/verify`, {
              method: "POST",
              headers: { ...SHAPED, "content-length": 100 },
            });
            req.on("error", () => resolve());
            req.write("{", () => req.destroy());
            req.on("close", () => resolve());
          }),
        );
        const health = await fetch(`${url}/healthz`);
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ ok: true });
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });

    it.each([
      ["not JSON", "{secret-token"],
      ["not a job", '{"job":1}'],
      ["a job with an unexpected field", '{"secret-token-field":1}'],
    ])("refuses a signed body that is %s with 400, never quoting it", async (_, text) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = await post(url, text);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid job spec" });
        expect(response.headers.get("connection")).toBe("close");
        expect(submitted).toEqual([]);
        // The reason stays in this host's log.
        expect(error).toHaveBeenCalledWith(expect.stringMatching(/^dispatch refused: /));
      } finally {
        error.mockRestore();
      }
    });
  });

  describe("routing", () => {
    it.each([
      ["GET", "/verify"],
      ["POST", "/verify/"],
      ["POST", "/verify?x=1"],
      ["POST", "/healthz"],
      ["GET", "/"],
      ["DELETE", "/internal/verifications"],
    ])("answers %s %s with 404, closing the connection", async (method, path) => {
      const response = await fetch(`${url}${path}`, { method });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not found" });
      expect(response.headers.get("connection")).toBe("close");
    });

    it("answers /healthz with {ok} only, 503 when unhealthy, closing the connection", async () => {
      const up = await fetch(`${url}/healthz`);
      expect([up.status, await up.json()]).toEqual([200, { ok: true }]);
      expect(up.headers.get("connection")).toBe("close");
      healthy = false;
      const down = await fetch(`${url}/healthz`);
      expect([down.status, await down.json()]).toEqual([503, { ok: false }]);
    });
  });

  describe("connection slots", () => {
    it("lets a signed dispatch through right after 32 keep-alive /healthz clients", async () => {
      // Each client asks to keep its connection; the server closes it after answering, so the
      // connection limit (32) is free again for the coordinator.
      const agent = new Agent({ keepAlive: true, maxSockets: 32 });
      try {
        const answers = await within(
          BOUND_MS,
          "32 /healthz",
          Promise.all(
            Array.from(
              { length: 32 },
              () =>
                new Promise<number>((resolve, reject) => {
                  request(`${url}/healthz`, { agent }, (res) => {
                    res.resume();
                    res.on("end", () => resolve(res.statusCode ?? 0));
                  })
                    .on("error", reject)
                    .end();
                }),
            ),
          ),
        );
        expect(answers.every((s) => s === 200)).toBe(true);
        const response = await post(url, body);
        expect(response.status).toBe(202);
      } finally {
        agent.destroy();
      }
    });

    it("closes an idle keep-alive connection within about 1 s of a 202", async () => {
      const socket = connect((server.address() as AddressInfo).port, "127.0.0.1");
      const closed = new Promise<number>((r) => socket.once("close", () => r(Date.now())));
      socket.on("data", () => {});
      await new Promise<void>((r) => socket.once("connect", () => r()));
      const headers = Object.entries({ ...signedDispatch(body), "content-length": body.length })
        .map(([k, v]) => `${k}: ${v}\r\n`)
        .join("");
      const sent = Date.now();
      socket.write(`POST /verify HTTP/1.1\r\nhost: x\r\n${headers}\r\n${body}`);
      const at = await within(4_000, "keep-alive close", closed);
      expect(at - sent).toBeLessThan(3_000);
      expect(submitted).toHaveLength(1);
    });

    it.each([
      ["never sends a byte", ""],
      ["never completes its request line", "POST /veri"],
      ["dribbles its headers", "POST /verify HTTP/1.1\r\nhost: x\r\n"],
    ])("drops a socket that %s within about 5 s", { timeout: 15_000 }, async (_, start) => {
      const socket = connect((server.address() as AddressInfo).port, "127.0.0.1");
      socket.on("error", () => {});
      await new Promise<void>((r) => socket.once("connect", () => r()));
      const opened = Date.now();
      const closed = new Promise<number>((r) => socket.once("close", () => r(Date.now())));
      if (start) socket.write(start);
      const dribble = start.endsWith("\n")
        ? setInterval(() => socket.write("x-a: b\r\n"), 500)
        : undefined;
      try {
        const at = await within(9_000, "socket close", closed);
        expect(at - opened).toBeLessThan(8_000);
      } finally {
        clearInterval(dribble);
        socket.destroy();
      }
    });
  });
});
