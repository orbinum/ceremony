/** `download` on a synthetic ceremony: pins, transcript checks, the lock and rollback. */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcript } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runDownload } from "../../../src/commands/download";
import { withLock } from "../../../src/store";
import {
  editJson,
  rejection,
  serveDir,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../../support";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});

async function mirror(source: Synthetic, dir = source.dir, out?: string) {
  const server = await serveDir(dir);
  const into = out ?? (await mkdtemp(join(tmpdir(), "orbinum-download-")));
  cleanup.push(
    () => server.close(),
    () => rm(into, { recursive: true, force: true }),
  );
  const run = (force = false) =>
    runDownload({
      from: server.url,
      dir: into,
      announcementSha256: source.announcementSha256,
      withPtau: false,
      force,
    });
  return { server, out: into, run };
}

describe("download", () => {
  it("mirrors every pinned file of a finalized ceremony", async () => {
    const c = await syntheticCeremony();
    const { out, run } = await mirror(c);
    expect(await run()).toBe(11);
    expect(await readFile(layout(out).transcript, "utf8")).toBe(
      await readFile(layout(c.dir).transcript, "utf8"),
    );
  });

  it("refuses a mirror serving a substituted zkey, and keeps nothing of it", async () => {
    const c = await syntheticCeremony();
    const copy = await tamperedCopy(c.dir, (d) =>
      writeFile(layout(d).zkey("shield", 1), "another contribution"),
    );
    const { out, run } = await mirror(c, copy);
    expect((await rejection(run())).message).toBe(
      "contributions/shield/1.zkey: does not match its pinned hash",
    );
    expect(existsSync(layout(out).zkey("shield", 1))).toBe(false);
  });

  it("refuses a ceremony.json other than the pinned one", async () => {
    const c = await syntheticCeremony();
    const { out, run } = await mirror({ ...c, announcementSha256: "00".repeat(32) });
    expect((await rejection(run())).message).toBe("ceremony.json: does not match its pinned hash");
    expect(existsSync(layout(out).announcement)).toBe(false);
  });

  it("never replaces a sealed local transcript with an older one, unless forced", async () => {
    const c = await syntheticCeremony();
    const { out, run } = await mirror(c);
    await run();
    const sealed = await readFile(layout(out).transcript, "utf8");

    const older = await tamperedCopy(c.dir, (d) =>
      editJson<Transcript>(layout(d).transcript, (t) => {
        t.records.pop();
        t.finals = [];
      }),
    );
    const stale = await mirror(c, older, out);
    expect((await rejection(stale.run())).message).toMatch(
      /^transcript\.json refused: it would roll back the local one \(2 records, 3 here; drops or changes the local finals\)/,
    );
    expect(await readFile(layout(out).transcript, "utf8")).toBe(sealed);
    expect(existsSync(`${layout(out).transcript}.download`)).toBe(false);

    await stale.run(true);
    expect(
      (JSON.parse(await readFile(layout(out).transcript, "utf8")) as Transcript).finals,
    ).toEqual([]);
  });

  it("keeps the local transcript when the mirror serves a broken one", async () => {
    const c = await syntheticCeremony();
    const { out, run } = await mirror(c);
    await run();
    const before = await readFile(layout(out).transcript, "utf8");
    const broken = await tamperedCopy(c.dir, (d) =>
      editJson<Transcript>(layout(d).transcript, (t) => {
        (t.records[0] as { chain: string }).chain = "00".repeat(32);
      }),
    );
    const bad = await mirror(c, broken, out);
    expect((await rejection(bad.run(true))).message).toMatch(
      /^transcript\.json refused: hash chain verifies from the announcement: broken at record 0/,
    );
    expect(await readFile(layout(out).transcript, "utf8")).toBe(before);
    expect(bad.server.requests.some((r) => r.path.startsWith("/contributions/"))).toBe(false);
  });

  it("does not run while another command holds the ceremony", async () => {
    const c = await syntheticCeremony();
    const { out, run } = await mirror(c);
    await withLock(layout(out).lock, async () => {
      await expect(run()).rejects.toThrow(/locked by another run/);
    });
    expect(existsSync(layout(out).transcript)).toBe(false);
  });
});
