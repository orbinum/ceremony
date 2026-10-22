/** The operator's state on disk: the lock, the transcript store and local metrics (SPEC §6.3). */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Transcript } from "@orbinum-ceremony/core";
import { layout } from "../../src/artifacts";
import { hasContributions, loadMetrics, openTranscript, withLock } from "../../src/store";
import { editJson, opened, rejection, rewriteHistory, syntheticCeremony } from "../support";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-store-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("the ceremony lock", () => {
  it("is exclusive, and released after the run", async () => {
    const lock = join(dir, ".local", "lock");
    await withLock(lock, async () => {
      expect(await readFile(lock, "utf8")).toBe(`${process.pid}\n`);
      await expect(withLock(lock, async () => undefined)).rejects.toThrow(/locked by another run/);
      // The refused run must not have removed the lock it did not create.
      expect(await readFile(lock, "utf8")).toBe(`${process.pid}\n`);
    });
    await expect(withLock(lock, async () => "again")).resolves.toBe("again");
  });

  // Root ignores directory permissions, so the refusal cannot be provoked as root.
  it.skipIf(process.getuid?.() === 0)(
    "reports an error that is not contention as itself",
    async () => {
      const ro = join(dir, "ro");
      await mkdir(ro);
      await chmod(ro, 0o500);
      try {
        await expect(withLock(join(ro, "lock"), async () => undefined)).rejects.toThrow(/EACCES/);
      } finally {
        await chmod(ro, 0o700);
      }
    },
  );
});

/** Opens the transcript store of the ceremony in `ceremony`. */
const open = async (ceremony: string) => openTranscript(ceremony, ...(await opened(ceremony)));

describe("the transcript store", () => {
  it("refuses to start a transcript over contributions on disk", async () => {
    const c = await syntheticCeremony({ finalized: false });
    expect(await hasContributions(c.dir, ["shield"])).toBe(true);
    await rm(layout(c.dir).transcript);
    expect((await rejection(open(c.dir))).message).toBe(
      "transcript.json is missing but contributions are on disk",
    );
  });

  it("refuses a transcript anchored in another announcement", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await editJson<Transcript>(layout(c.dir).transcript, (t) => {
      t.anchor.sha256 = "00".repeat(32);
    });
    expect((await rejection(open(c.dir))).message).toMatch(/^transcript: /);
  });

  it("refuses a broken chain, even with every record valid", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await editJson<Transcript>(layout(c.dir).transcript, (t) => {
      (t.records[1] as { prev_chain: string }).prev_chain = "00".repeat(32);
    });
    expect((await rejection(open(c.dir))).message).toBe("transcript chain broken at record 1");
    // A rewritten history whose chain was recomputed opens: integrity is checked by its users.
    const d = await syntheticCeremony({ finalized: false });
    await rewriteHistory(d.dir, (records) => records.slice(0, 1));
    expect((await open(d.dir)).transcript.records).toHaveLength(1);
  });

  it("starts an empty transcript in a fresh ceremony and persists each append", async () => {
    const c = await syntheticCeremony({ contributors: 1, finalized: false });
    await rm(layout(c.dir).transcript);
    await rm(layout(c.dir).contributions("shield"), { recursive: true });
    expect(await hasContributions(c.dir, ["shield"])).toBe(false);
    const store = await open(c.dir);
    expect(store.transcript.records).toEqual([]);
    const record = c.transcript.records[0] as Transcript["records"][number];
    const { prev_chain: _p, chain: _c, ...plain } = record;
    await store.append(plain);
    const saved = JSON.parse(await readFile(layout(c.dir).transcript, "utf8")) as Transcript;
    expect(saved.records).toEqual([record]);
  });
});

describe("local metrics", () => {
  it("are validated when read back", async () => {
    const d = await mkdtemp(join(tmpdir(), "orbinum-metrics-"));
    await mkdir(join(d, ".local"));
    const ok = { "shield/1": { bytes: 10, ms: { contribute: 1, precheck: 2, verify: 3 } } };
    await writeFile(join(d, ".local", "metrics.json"), JSON.stringify(ok));
    expect(await loadMetrics(d)).toEqual(ok);
    await writeFile(join(d, ".local", "metrics.json"), JSON.stringify({ x: { bytes: -1 } }));
    await expect(loadMetrics(d)).rejects.toThrow(/metrics\.x/);
    await writeFile(join(d, ".local", "metrics.json"), "\u001b[2K{");
    await expect(loadMetrics(d)).rejects.toThrow("metrics.json: not valid JSON");
    expect(await loadMetrics(join(d, "none"))).toEqual({});
  });
});
