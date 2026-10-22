/** Downloads from mirrors: bounded, never through a planted link. */
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadFirst } from "../../src/io";
import { localServer } from "../support/http";

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
