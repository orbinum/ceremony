/** Small JSON documents over HTTP (drand rounds): bounded in bytes and time, never echoed. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rejection } from "../support/errors";
import { fetchJson } from "../../src/io";
import { json, localServer } from "../support/http";

let server: Awaited<ReturnType<typeof localServer>>;

beforeAll(async () => {
  server = await localServer({
    "/ok": (_q, res) => json(res, 200, { round: 1 }),
    "/big": (_q, res) => res.writeHead(200).end("x".repeat(70 * 1024)),
    "/multibyte": (_q, res) => {
      res.writeHead(200, { "transfer-encoding": "chunked" });
      res.end(`"${"€".repeat(25_000)}"`);
    },
    "/declared": (_q, res) => res.writeHead(200, { "content-length": "999999999" }).end("{}"),
    "/ansi": (_q, res) => res.writeHead(200).end("\u001b[2K{"),
    "/500": (_q, res) => res.writeHead(500).end(),
    "/slow": () => undefined,
  });
});
afterAll(() => server.close());

describe("fetchJson", () => {
  it("reads a small JSON document", async () => {
    expect(await fetchJson(`${server.url}/ok`)).toEqual({ round: 1 });
  });

  it("refuses a body over the cap, counted in bytes while reading", async () => {
    await expect(fetchJson(`${server.url}/big`)).rejects.toThrow(/larger than 65536 bytes/);
    await expect(fetchJson(`${server.url}/multibyte`)).rejects.toThrow(/larger than 65536 bytes/);
    await expect(fetchJson(`${server.url}/declared`)).rejects.toThrow(/larger than 65536 bytes/);
  });

  it("refuses invalid JSON without echoing it, a failed status, and a server that never answers", async () => {
    const error = await rejection(fetchJson(`${server.url}/ansi`));
    expect(error.message).toBe(`${server.url}/ansi: not valid JSON`);
    await expect(fetchJson(`${server.url}/500`)).rejects.toThrow(/HTTP 500/);
    await expect(fetchJson(`${server.url}/slow`, 200)).rejects.toThrow(/timeout|aborted/i);
  });
});
