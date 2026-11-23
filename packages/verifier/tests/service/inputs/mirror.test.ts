/** Mirroring the published inputs (an empty-disk host): exactly the pinned init.json, then its files. */
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CEREMONY_LAYOUT, sha256Hex } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it } from "vitest";
import { mirrorInputs } from "../../../src/service";
import { fakeCeremony } from "../../support";

let server: Server | undefined;
afterEach(() => server?.close());

/** Serves `/artifacts/<key>` from `files` (a redirect for `redirect`); returns its origin. */
async function coordinator(files: Record<string, string>, redirect?: string): Promise<string> {
  server = createServer((req, res) => {
    const key = (req.url ?? "").replace(/^\/artifacts\//, "");
    if (key === redirect) return res.writeHead(302, { location: "/elsewhere" }).end();
    const path = files[key];
    if (!path) return res.writeHead(404).end();
    void readFile(path).then((b) => res.writeHead(200).end(b));
  });
  await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

async function published() {
  const { dir, ptau } = await fakeCeremony();
  const files = {
    [CEREMONY_LAYOUT.init]: join(dir, CEREMONY_LAYOUT.init),
    [CEREMONY_LAYOUT.zkey("shield", 0)]: join(dir, CEREMONY_LAYOUT.zkey("shield", 0)),
    [CEREMONY_LAYOUT.ptau]: ptau,
  };
  const initSha256 = sha256Hex(await readFile(files[CEREMONY_LAYOUT.init] as string));
  const to = await mkdtemp(join(tmpdir(), "orbinum-verifier-mirror-"));
  return { files, initSha256, to, ptau: join(to, CEREMONY_LAYOUT.ptau) };
}

describe("mirrorInputs", () => {
  it("writes init.json, every genesis it names and the ptau, byte for byte", async () => {
    const p = await published();
    await mirrorInputs(await coordinator(p.files), p.initSha256, p.to, p.ptau);
    const copies = Object.entries(p.files).map(async ([key, source]) => {
      const dest = key === CEREMONY_LAYOUT.ptau ? p.ptau : join(p.to, key);
      expect(await readFile(dest)).toEqual(await readFile(source));
    });
    await Promise.all(copies);
  });

  it("refuses an init.json the coordinator's setup does not pin, before fetching anything else", async () => {
    const p = await published();
    await expect(
      mirrorInputs(await coordinator(p.files), "ab".repeat(32), p.to, p.ptau),
    ).rejects.toThrow("init.json: the published file is not the one the coordinator's setup pins");
    await expect(readFile(join(p.to, CEREMONY_LAYOUT.zkey("shield", 0)))).rejects.toThrow(/ENOENT/);
  });

  it("follows no redirect and names a missing file", async () => {
    const p = await published();
    const key = CEREMONY_LAYOUT.zkey("shield", 0);
    await expect(
      mirrorInputs(await coordinator(p.files, key), p.initSha256, p.to, p.ptau),
    ).rejects.toThrow("fetch failed");
    const q = await published();
    const { [CEREMONY_LAYOUT.ptau]: _, ...noPtau } = q.files;
    await expect(
      mirrorInputs(await coordinator(noPtau), q.initSha256, q.to, q.ptau),
    ).rejects.toThrow(`${CEREMONY_LAYOUT.ptau}: the coordinator answered 404`);
  });
});
