/**
 * The coordinator client against a real loopback server that misbehaves: compressed answers,
 * redirects, endless error bodies, short and long bodies. Control bytes from a body never reach
 * the message.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, readdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fetchObject, postReport } from "../../../src/service";
import { CEREMONY_ID, HMAC_KEY, within } from "../../support";

const JOB = { seq: 1, circuit: "shield", attempt: 2, index: 1 } as const;
let handler: (req: IncomingMessage, res: ServerResponse) => void = (_, res) => res.end();
let hits = 0;
let server: Server;
let ep = { coordinatorUrl: "", hmacKey: HMAC_KEY, ceremonyId: CEREMONY_ID };
let dir = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  ep = { ...ep, coordinatorUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});
beforeEach(async () => {
  hits = 0;
  dir = await mkdtemp(join(tmpdir(), "orbinum-client-attacks-"));
});

describe("coordinator client vs a misbehaving coordinator", () => {
  it("refuses a gzip-encoded object (whichever length it declares), never writing it whole", async () => {
    const plain = Buffer.alloc(4096, 7);
    const gz = gzipSync(plain);
    for (const size of [gz.length, plain.length]) {
      handler = (_, res) => {
        res.writeHead(200, { "content-encoding": "gzip", "content-length": gz.length });
        res.end(gz);
      };
      const dest = join(dir, `gz-${size}.zkey`);
      await expect(fetchObject(ep, JOB, size, dest, AbortSignal.timeout(5_000))).rejects.toThrow(
        /object fetch|more than \d+ bytes/,
      );
    }
  });

  it("retries a redirect like a network error until the deadline, never following it", async () => {
    let elsewhere = 0;
    const other = createServer((_, res) => ((elsewhere += 1), res.end("x")));
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    const location = `http://127.0.0.1:${(other.address() as AddressInfo).port}/x`;
    handler = (_, res) => {
      res.writeHead(302, { location });
      res.end();
    };
    try {
      await expect(
        fetchObject(ep, JOB, 1, join(dir, "r.zkey"), AbortSignal.timeout(2_500)),
      ).rejects.toThrow(/aborted due to timeout/);
      expect(elsewhere).toBe(0);
      expect(hits).toBeGreaterThan(1);
    } finally {
      await new Promise((r) => other.close(r));
    }
  }, 10_000);

  it("reads only the start of a never-ending 4xx body and returns promptly", async () => {
    handler = (_, res) => {
      res.writeHead(409, { "content-type": "text/plain" });
      const t = setInterval(() => {
        if (!res.write(`${"A".repeat(4096)}\u001b[2J`)) clearInterval(t);
      }, 5);
      res.on("close", () => clearInterval(t));
    };
    const error = await within(
      5_000,
      "endless 4xx",
      postReport(ep, { job: JOB, result: "infra", detail: "x" }, AbortSignal.timeout(4_000)).then(
        () => undefined,
        (e: Error) => e,
      ),
    );
    expect(error?.message).toMatch(/^report: the coordinator answered 409 A+/);
    expect((error?.message.length ?? 0) < 1_100).toBe(true);
    expect(error?.message).not.toContain("\u001b");
  });

  it("refuses an object longer than declared at the bound, and a short one", async () => {
    handler = (_, res) => {
      res.writeHead(200, { "content-length": 10 });
      res.end("0123456789");
    };
    await expect(fetchObject(ep, JOB, 9, join(dir, "l.zkey"))).rejects.toThrow(/length/);
    handler = (req, res) => {
      res.writeHead(200, { "content-length": 10 });
      res.write("01234");
      setTimeout(() => req.socket.destroy(), 20);
    };
    await expect(
      fetchObject(ep, JOB, 10, join(dir, "s.zkey"), AbortSignal.timeout(3_000)),
    ).rejects.toThrow(/terminated|shorter than declared/);
  });

  it("never overwrites an existing destination (exclusive create)", async () => {
    handler = (_, res) => {
      res.writeHead(200, { "content-length": 3 });
      res.end("abc");
    };
    const dest = join(dir, "once.zkey");
    expect(await fetchObject(ep, JOB, 3, dest)).toBe(true);
    await expect(fetchObject(ep, JOB, 3, dest)).rejects.toThrow(/EEXIST/);
    expect(await readdir(dir)).toEqual(["once.zkey"]);
  });
});
