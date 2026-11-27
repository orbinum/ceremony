/**
 * Downloads from mirrors: bounded, never through a planted link, and never to a name with any
 * internal address among its public ones (DNS rebinding).
 */
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  downloadFirst,
  isInternalAddress,
  publicOnlyLookup,
  redirectRefusal,
} from "../../../src/io";
import { localServer } from "../../support/http";

let dir: string;
let server: Awaited<ReturnType<typeof localServer>>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-download-"));
  server = await localServer({
    "/file": (_q, res) => res.writeHead(200).end("content"),
    "/big": (_q, res) => {
      res.writeHead(200, { "transfer-encoding": "chunked" });
      res.end("x".repeat(100));
    },
    "/declared": (_q, res) => res.writeHead(200, { "content-length": "100" }).end("x".repeat(100)),
    "/404": (_q, res) => res.writeHead(404).end(),
  });
});
afterAll(async () => {
  await server.close();
  await rm(dir, { recursive: true, force: true });
});

describe("downloads from mirrors", () => {
  it("takes the first mirror that answers", async () => {
    const dest = join(dir, "a");
    expect(await downloadFirst([`${server.url}/404`, `${server.url}/file`], dest, 1000)).toBe(
      `${server.url}/file`,
    );
    expect(await readFile(dest, "utf8")).toBe("content");
  });

  it("refuses a file over the cap, declared or not, and leaves nothing behind", async () => {
    const dest = join(dir, "b");
    await expect(downloadFirst([`${server.url}/big`], dest, 10)).rejects.toThrow(
      /more than 10 bytes/,
    );
    await expect(downloadFirst([`${server.url}/declared`], dest, 10)).rejects.toThrow(
      /declares more than 10 bytes/,
    );
    expect((await readdir(dir)).filter((f) => f.startsWith("b"))).toEqual([]);
  });

  it("never writes through a link planted at the .partial path", async () => {
    const target = join(dir, "victim");
    await writeFile(target, "untouched");
    await symlink(target, join(dir, "c.partial"));
    await downloadFirst([`${server.url}/file`], join(dir, "c"), 1000);
    expect(await readFile(target, "utf8")).toBe("untouched");
    expect(await readFile(join(dir, "c"), "utf8")).toBe("content");
  });
});

const hop = (from: string, to: string) => redirectRefusal(new URL(from), new URL(to));

describe("redirect hops", () => {
  it("keeps https on https, and off internal hosts named by IP literal or localhost", () => {
    expect(hop("https://mirror.example/a", "https://cdn.example/a")).toBeNull();
    expect(hop("https://mirror.example/a", "https://8.8.8.8/a")).toBeNull();
    expect(hop("https://mirror.example/a", "https://[2001:db8::1]/a")).toBeNull();
    expect(hop("https://mirror.example/a", "http://cdn.example/a")).toBe(
      "redirected from https to plain http",
    );
    for (const host of [
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "127.1",
      "0x7f000001",
      "169.254.169.254",
      "0.0.0.0",
      "[::1]",
      "[::]",
      "[fc00::1]",
      "[fd12:3456::1]",
      "[fe80::1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.1]",
      "localhost",
      "localhost.",
      "api.localhost",
    ]) {
      expect([host, hop("https://mirror.example/a", `https://${host}/a`)]).toEqual([
        host,
        "redirected from https to an internal host",
      ]);
    }
    expect(hop("https://mirror.example/a", "https://172.32.0.1/a")).toBeNull();
    expect(hop("https://mirror.example/a", "https://[fec0::1]/a")).toBeNull();
  });

  it("lets a loopback http mirror go to https or stay on loopback, nowhere else", () => {
    expect(hop("http://127.0.0.1:8080/a", "https://mirror.example/a")).toBeNull();
    for (const host of ["127.0.0.1:9", "localhost:9", "[::1]:9"]) {
      expect([host, hop("http://127.0.0.1:8080/a", `http://${host}/a`)]).toEqual([host, null]);
    }
    for (const to of ["http://mirror.example/a", "http://10.0.0.1/a", "file:///etc/passwd"]) {
      expect([to, hop("http://localhost:8080/a", to)]).toEqual([
        to,
        "redirected from plain http to neither https nor loopback",
      ]);
    }
  });
});

const answering =
  (...addresses: string[]) =>
  (
    _: string,
    __: object,
    cb: (e: Error | null, a: { address: string; family: number }[]) => void,
  ) =>
    cb(
      null,
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );
const resolve = (lookup: ReturnType<typeof publicOnlyLookup>) =>
  new Promise<Error | null>((done) => lookup("mirror.example", { all: true }, (e) => done(e)));

describe("connections of an https hop", () => {
  it("count every private, loopback, link-local, CGNAT, NAT64 and mapped address as internal", () => {
    for (const a of [
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "127.0.0.2",
      "169.254.169.254",
      "100.64.0.1",
      "100.127.255.254",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "64:ff9b::a00:1",
      "64:ff9b:1::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "not-an-ip",
    ]) {
      expect([a, isInternalAddress(a)]).toEqual([a, true]);
    }
    for (const a of ["1.1.1.1", "100.128.0.1", "2606:4700:4700::1111"]) {
      expect([a, isInternalAddress(a)]).toEqual([a, false]);
    }
  });

  it("refuse a name that resolves to an internal address, at the connection's own lookup", async () => {
    expect(await resolve(publicOnlyLookup(answering("1.1.1.1")))).toBeNull();
    const rebinding = await resolve(publicOnlyLookup(answering("1.1.1.1", "127.0.0.1")));
    expect(rebinding?.message).toBe("mirror.example resolves to an internal address");
    expect((await resolve(publicOnlyLookup(answering("100.64.1.1"))))?.message).toMatch(/internal/);
    expect((await resolve(publicOnlyLookup(answering())))?.message).toMatch(/internal/);
  });
});
