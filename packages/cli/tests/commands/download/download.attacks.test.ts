/**
 * Attacks on `download` from a hostile mirror, each against a synthetic ceremony served from
 * loopback. A zkey is bounded by its genesis size + 1 KiB per contribution and a log by
 * MAX_LOG_CHARS, so a mirror cannot fill the disk.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  type Chained,
  type ContributionRecord,
  MAX_LOG_CHARS,
  sha256Hex,
  type Transcript,
} from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runDownload } from "../../../src/commands/download";
import {
  editJson,
  localServer,
  rejection,
  rewriteHistory,
  serveDir,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../../support";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});

const fresh = async (prefix = "orbinum-attack-dl-") => {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
};

const download = (c: Synthetic, from: string, dir: string, force = false) =>
  runDownload({ from, dir, announcementSha256: c.announcementSha256, withPtau: false, force });

async function serve(dir: string) {
  const s = await serveDir(dir);
  cleanup.push(() => s.close());
  return s;
}

async function rawServer(answer: (socket: Socket, path: string) => void) {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let head = "";
    socket.on("data", (d) => {
      head += d.toString("latin1");
      if (head.includes("\r\n\r\n")) {
        const path = head.split(" ")[1] ?? "/";
        head = "";
        answer(socket, path);
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  cleanup.push(
    () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function inventContributions(
  dir: string,
  n: number,
  bytesOf: (index: number) => { zkey: Uint8Array; log: Uint8Array },
) {
  const paths = layout(dir);
  await rewriteHistory(dir, (records) => {
    const contributions = records.filter(
      (r): r is Chained<ContributionRecord> => r.type === "contribution",
    );
    const last = contributions.at(-1) as Chained<ContributionRecord>;
    const rest = records.filter((r) => r.type !== "contribution");
    const added: Chained[] = [];
    let previous = last.output_sha256;
    for (let i = 1; i <= n; i++) {
      const index = last.index + i;
      const { zkey, log } = bytesOf(index);
      const h = randomBytes(64).toString("hex");
      const record = {
        ...last,
        seq: last.seq + i,
        index,
        input_sha256: previous,
        output_sha256: sha256Hex(zkey),
        verifier_log_sha256: sha256Hex(log),
        contribution_hash: h,
        client_contribution_hash: h,
        zkey_name: `invented-${index}`,
      };
      previous = record.output_sha256;
      added.push(record);
    }
    return [...contributions, ...added, ...rest];
  });
  const t = JSON.parse(await readFile(paths.transcript, "utf8")) as Transcript;
  await mkdir(paths.contributions("shield"), { recursive: true });
  await mkdir(join(dir, "logs", "shield"), { recursive: true });
  await Promise.all(
    t.records.flatMap((r) => {
      if (r.type !== "contribution" || !r.zkey_name.startsWith("invented-")) return [];
      const { zkey, log } = bytesOf(r.index);
      return [
        writeFile(paths.zkey("shield", r.index), zkey),
        writeFile(paths.log("shield", r.index), log),
      ];
    }),
  );
}

describe("download against a hostile mirror", () => {
  it("refuses a transcript not anchored in the pinned ceremony.json, fetching nothing it names", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const copy = await tamperedCopy(c.dir, (d) =>
      editJson<Transcript>(layout(d).transcript, (t) => {
        t.anchor.sha256 = "11".repeat(32);
      }),
    );
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    const e = await rejection(download(c, s.url, out));
    expect(e.message).toMatch(/transcript\.json refused: .*anchor SHA-256 differs/);
    expect(
      s.requests.some((r) => /^\/(contributions|logs|final|r1cs|genesis\/s)/.test(r.path)),
    ).toBe(false);
    expect(existsSync(layout(out).transcript)).toBe(false);
  });

  it("refuses a transcript with a record whose circuit name is a path, before fetching anything", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const copy = await tamperedCopy(c.dir, (d) =>
      editJson<Transcript>(layout(d).transcript, (t) => {
        (t.records[0] as { circuit: string }).circuit = "../../../../tmp/evil";
      }),
    );
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    const e = await rejection(download(c, s.url, out));
    expect(e.message).toMatch(/circuit: does not match/);
    expect(s.requests.map((r) => r.path)).toEqual([
      "/ceremony.json",
      "/genesis/init.json",
      "/transcript.json",
    ]);
  });

  it("mirrors a long invented but internally consistent chain when no transcript is pinned, checking each file against it", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const copy = await tamperedCopy(c.dir, (d) =>
      inventContributions(d, 25, (i) => ({
        zkey: Buffer.from(`invented zkey ${i}`),
        log: Buffer.from(`invented log ${i}`),
      })),
    );
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    expect(await download(c, s.url, out)).toBe(3 + 2 + 27 * 2 + 2);
  });

  it("refuses an invented chain when the sealed transcript is pinned, fetching nothing it names", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const sealed = sha256Hex(await readFile(layout(c.dir).transcript));
    const copy = await tamperedCopy(c.dir, (d) =>
      inventContributions(d, 3, (i) => ({
        zkey: Buffer.from(`invented zkey ${i}`),
        log: Buffer.from(`invented log ${i}`),
      })),
    );
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    const pinned = { from: s.url, dir: out, withPtau: false, force: false };
    const e = await rejection(
      runDownload({
        ...pinned,
        announcementSha256: c.announcementSha256,
        transcriptSha256: sealed,
      }),
    );
    expect(e.message).toMatch(/not the one --transcript-sha256 pins/);
    expect(s.requests.some((r) => /^\/(contributions|logs|final)/.test(r.path))).toBe(false);
    const real = await serve(c.dir);
    expect(
      await runDownload({
        ...pinned,
        from: real.url,
        announcementSha256: c.announcementSha256,
        transcriptSha256: sealed,
      }),
    ).toBeGreaterThan(0);
  });

  it("refuses an intermediate zkey or log far above what an honest one can be", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const big = new Uint8Array(4 * 1024 * 1024).fill(0x41);
    const copy = await tamperedCopy(c.dir, (d) =>
      inventContributions(d, 1, () => ({
        zkey: big,
        log: new Uint8Array(MAX_LOG_CHARS + 1024).fill(0x41),
      })),
    );
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    await expect(download(c, s.url, out)).rejects.toThrow(/zkey: more than \d+ bytes/);
  });

  it("refuses a log and a final vk that do not match their records, keeping neither", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const copy = await tamperedCopy(c.dir, async (d) => {
      await writeFile(layout(d).log("shield", 2), "another log");
    });
    cleanup.push(() => rm(copy, { recursive: true, force: true }));
    const s = await serve(copy);
    const out = await fresh();
    expect((await rejection(download(c, s.url, out))).message).toBe(
      "logs/shield/2.log: does not match its pinned hash",
    );
    expect(existsSync(layout(out).log("shield", 2))).toBe(false);

    const copy2 = await tamperedCopy(c.dir, (d) => writeFile(layout(d).finalVk("shield"), "{}"));
    cleanup.push(() => rm(copy2, { recursive: true, force: true }));
    const s2 = await serve(copy2);
    const out2 = await fresh();
    expect((await rejection(download(c, s2.url, out2))).message).toBe(
      "final/shield.vk.json: does not match its pinned hash",
    );
    expect(existsSync(layout(out2).finalVk("shield"))).toBe(false);
  });

  it("follows a redirect to another host only for content it checks by hash", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const real = await serve(c.dir);
    const redirector = await localServer({
      "*": (req, res) => res.writeHead(302, { location: `${real.url}${req.url ?? "/"}` }).end(),
    });
    cleanup.push(() => redirector.close());
    const out = await fresh();
    expect(await download(c, redirector.url, out)).toBe(11);
    expect(real.requests.length).toBe(11);
  });

  it("refuses a redirect to file://, and keeps nothing", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const victim = join(await fresh(), "secret.json");
    await writeFile(victim, "{}");
    const s = await localServer({
      "*": (_req, res) => res.writeHead(302, { location: `file://${victim}` }).end(),
    });
    cleanup.push(() => s.close());
    const out = await fresh();
    await expect(download(c, s.url, out)).rejects.toThrow(/all mirrors failed/);
    expect((await readdir(out)).filter((f) => f !== ".local")).toEqual([]);
  });

  it("refuses a redirect from a loopback http mirror to plain http elsewhere, fetching nothing there", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const real = await serve(c.dir);
    const elsewhere = new URL(real.url);
    elsewhere.hostname = "ceremony-mirror.invalid";
    const s = await localServer({
      "*": (req, res) =>
        res.writeHead(302, { location: `${elsewhere.origin}${req.url ?? "/"}` }).end(),
    });
    cleanup.push(() => s.close());
    const out = await fresh();
    const error = await rejection(download(c, s.url, out));
    expect(error.message).toMatch(/redirected from plain http to neither https nor loopback/);
    expect(real.requests).toEqual([]);
    expect((await readdir(out)).filter((f) => f !== ".local")).toEqual([]);
  });

  it("follows a redirect from a loopback http mirror to another loopback spelling", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const real = await serve(c.dir);
    const other = new URL(real.url);
    other.hostname = "localhost";
    const s = await localServer({
      "*": (req, res) => res.writeHead(302, { location: `${other.origin}${req.url ?? "/"}` }).end(),
    });
    cleanup.push(() => s.close());
    expect(await download(c, s.url, await fresh())).toBe(11);
  });

  it("refuses a redirect loop", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const s = await localServer({
      "*": (req, res) => res.writeHead(302, { location: req.url ?? "/" }).end(),
    });
    cleanup.push(() => s.close());
    await expect(download(c, s.url, await fresh())).rejects.toThrow(/all mirrors failed/);
  });

  it("refuses an enormous declared Content-Length without reading the body", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const ann = await readFile(layout(c.dir).announcement);
    const init = await readFile(layout(c.dir).init);
    const url = await rawServer((socket, path) => {
      if (path === "/ceremony.json" || path === "/genesis/init.json") {
        const body = path === "/ceremony.json" ? ann : init;
        socket.write(`HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\n\r\n`);
        socket.write(body);
        return;
      }
      socket.write("HTTP/1.1 200 OK\r\ncontent-length: 1000000000000\r\n\r\n");
      socket.write("x".repeat(1000));
    });
    const started = Date.now();
    await expect(download(c, url, await fresh())).rejects.toThrow(/declares more than/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("refuses a body shorter than its Content-Length (truncated), keeping nothing", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const ann = await readFile(layout(c.dir).announcement);
    const url = await rawServer((socket) => {
      socket.write(`HTTP/1.1 200 OK\r\ncontent-length: ${ann.length + 50}\r\n\r\n`);
      socket.end(ann);
    });
    const out = await fresh();
    await expect(download(c, url, out)).rejects.toThrow(/all mirrors failed/);
    expect(existsSync(layout(out).announcement)).toBe(false);
    expect(existsSync(`${layout(out).announcement}.partial`)).toBe(false);
  });

  it("never keeps bytes past a too-small Content-Length as part of the file", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const ann = await readFile(layout(c.dir).announcement);
    const url = await rawServer((socket) => {
      socket.write(`HTTP/1.1 200 OK\r\ncontent-length: ${ann.length - 10}\r\n\r\n`);
      socket.end(Buffer.concat([ann, Buffer.from("trailing garbage")]));
    });
    const out = await fresh();
    await expect(download(c, url, out)).rejects.toThrow(
      /does not match its pinned hash|all mirrors failed/,
    );
    expect(existsSync(layout(out).announcement)).toBe(false);
  });

  it("bounds a gzip bomb by its decoded size", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const ann = await readFile(layout(c.dir).announcement);
    const init = await readFile(layout(c.dir).init);
    const bomb = gzipSync(Buffer.alloc(70 * 1024 * 1024, 0x20), { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const s = await localServer({
      "/ceremony.json": (_q, res) => res.writeHead(200).end(ann),
      "/genesis/init.json": (_q, res) => res.writeHead(200).end(init),
      "/transcript.json": (_q, res) =>
        res
          .writeHead(200, { "content-encoding": "gzip", "content-length": String(bomb.length) })
          .end(bomb),
    });
    cleanup.push(() => s.close());
    const out = await fresh();
    await expect(download(c, s.url, out)).rejects.toThrow(/more than 67108864 bytes/);
    expect(existsSync(`${layout(out).transcript}.download`)).toBe(false);
    expect(existsSync(`${layout(out).transcript}.download.partial`)).toBe(false);
  });

  it("never writes outside --dir through a directory symlink already in it", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const s = await serve(c.dir);
    const out = await fresh();
    const victim = await fresh("orbinum-attack-victim-");
    await symlink(victim, join(out, "contributions"));
    await download(c, s.url, out).catch(() => undefined);
    expect(await readdir(victim)).toEqual([]);
  });

  it("refuses a pinned path that is a symlink without writing through it", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const s = await serve(c.dir);
    const out = await fresh();
    const victim = join(await fresh("orbinum-attack-victim-"), "victim");
    await writeFile(victim, "untouched");
    await mkdir(join(out, "r1cs"), { recursive: true });
    await symlink(victim, layout(out).r1cs("shield"));
    await expect(download(c, s.url, out)).rejects.toThrow(/ELOOP/);
    expect(await readFile(victim, "utf8")).toBe("untouched");
  });

  it("never writes through a link planted at transcript.json or its .download path", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const s = await serve(c.dir);
    const out = await fresh();
    const victimDir = await fresh("orbinum-attack-victim-");
    await writeFile(join(victimDir, "a"), "untouched-a");
    await writeFile(join(victimDir, "b"), "untouched-b");
    await symlink(join(victimDir, "a"), `${layout(out).transcript}.download`);
    await symlink(join(victimDir, "b"), `${layout(out).transcript}.download.partial`);
    await download(c, s.url, out);
    expect(await readFile(join(victimDir, "a"), "utf8")).toBe("untouched-a");
    expect(await readFile(join(victimDir, "b"), "utf8")).toBe("untouched-b");
  });

  it("replaces a stale pinned file in a non-empty --dir and leaves unrelated files alone", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    const s = await serve(c.dir);
    const out = await fresh();
    await mkdir(join(out, "final"), { recursive: true });
    await writeFile(layout(out).finalZkey("shield"), "stale final from elsewhere");
    await writeFile(join(out, "final", "transfer.final.zkey"), "junk");
    await download(c, s.url, out);
    expect(await readFile(layout(out).finalZkey("shield"))).toEqual(
      await readFile(layout(c.dir).finalZkey("shield")),
    );
    expect(await readFile(join(out, "final", "transfer.final.zkey"), "utf8")).toBe("junk");
  });
});
