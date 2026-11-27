/**
 * Attacks on the operator's lock and transcript store (concurrency, stale locks, symlinks) and on
 * publish-final's handover to a hostile coordinator. When a run's lock was deleted as stale and
 * retaken by another, the first run must not remove it on exit, or a third could start beside the
 * second.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeJson } from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../src/artifacts";
import { runPublishFinal } from "../../src/commands/publish-final";
import { loadMetrics, openTranscript, withLock } from "../../src/store";
import { json, localServer, opened, rejection, syntheticCeremony } from "../support";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});
const fresh = async () => {
  const d = await mkdtemp(join(tmpdir(), "orbinum-attack-store-"));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
};

describe("the ceremony lock", { timeout: 60_000 }, () => {
  it("refuses a concurrent run and a stale lock, which the operator removes by hand", async () => {
    const d = await fresh();
    const lock = join(d, ".local", "lock");
    let inner: Error | undefined;
    await withLock(lock, async () => {
      inner = await rejection(withLock(lock, async () => 1));
    });
    expect(inner?.message).toMatch(/locked by another run/);
    await mkdir(join(d, ".local"), { recursive: true });
    await writeFile(lock, "999999\n");
    expect((await rejection(withLock(lock, async () => 1))).message).toMatch(/locked/);
    expect(await readFile(lock, "utf8")).toBe("999999\n");
  });

  it("never follows a symlink planted at the lock path, nor deletes its target", async () => {
    const d = await fresh();
    const victim = join(d, "victim");
    await writeFile(victim, "untouched");
    await mkdir(join(d, ".local"));
    await symlink(victim, join(d, ".local", "lock"));
    await expect(withLock(join(d, ".local", "lock"), async () => 1)).rejects.toThrow(/locked/);
    expect(await readFile(victim, "utf8")).toBe("untouched");
    await rm(join(d, ".local", "lock"));
    await symlink(join(d, "nowhere"), join(d, ".local", "lock"));
    await expect(withLock(join(d, ".local", "lock"), async () => 1)).rejects.toThrow(/locked/);
    expect(existsSync(join(d, "nowhere"))).toBe(false);
  });

  it("follows a symlinked .local, keeping the lock where the link points", async () => {
    const d = await fresh();
    const elsewhere = await fresh();
    await symlink(elsewhere, join(d, ".local"));
    let seen: string[] = [];
    await withLock(layout(d).lock, async () => {
      seen = await readdir(elsewhere);
    });
    expect(seen).toEqual(["lock"]);
  });

  it("a run never removes a lock it no longer owns", async () => {
    const d = await fresh();
    const lock = join(d, ".local", "lock");
    let releaseB!: () => void;
    let bHolds!: () => void;
    const bHolding = new Promise<void>((r) => (bHolds = r));
    let lockWhileBRuns = true;
    await withLock(lock, async () => {
      await rm(lock);
      const b = withLock(lock, async () => {
        bHolds();
        await new Promise<void>((r) => (releaseB = r));
      });
      await bHolding;
      cleanup.push(async () => {
        releaseB();
        await b;
      });
    });
    lockWhileBRuns = existsSync(lock);
    releaseB();
    expect(lockWhileBRuns).toBe(true);
  });
});

describe("the operator's transcript and metrics", { timeout: 60_000 }, () => {
  it("refuses a transcript.json that is a symlink, and metrics.json that is one", async () => {
    const c = await syntheticCeremony();
    cleanup.push(() => rm(c.dir, { recursive: true, force: true }));
    const real = join(c.dir, "real-transcript.json");
    await writeFile(real, await readFile(layout(c.dir).transcript));
    await rm(layout(c.dir).transcript);
    await symlink(real, layout(c.dir).transcript);
    const [announcement] = await opened(c.dir);
    await expect(openTranscript(c.dir, announcement)).rejects.toThrow(/ELOOP/);
    await mkdir(layout(c.dir).local, { recursive: true });
    await writeFile(join(c.dir, "m.json"), serializeJson({}));
    await symlink(join(c.dir, "m.json"), layout(c.dir).metrics);
    await expect(loadMetrics(c.dir)).rejects.toThrow(/ELOOP/);
  });
});

describe("publish-final against a hostile coordinator", { timeout: 60_000 }, () => {
  it("does not count a redirected or foreign published transcript as 'already finalized'", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    cleanup.push(() => rm(c.dir, { recursive: true, force: true }));
    const elsewhere = await localServer({
      "*": (_q, res) =>
        res.writeHead(200, { "content-type": "application/json" }).end(serializeJson(c.transcript)),
    });
    const s = await localServer({
      "/admin/finalize": (_q, res) =>
        json(res, 409, { error: { code: "finalized", message: "finalized" } }),
      "/artifacts/transcript.json": (_q, res) =>
        res.writeHead(302, { location: `${elsewhere.url}/t` }).end(),
      "*": (req, res) =>
        json(res, 201, { ok: true, key: (req.url ?? "").replace("/admin/artifacts/", "") }),
    });
    cleanup.push(
      () => s.close(),
      () => elsewhere.close(),
    );
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      await expect(runPublishFinal({ dir: c.dir, coordinator: s.url })).rejects.toThrow(
        /fetch failed/,
      );
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
    expect(elsewhere.requests).toEqual([]);
    expect(s.requests.some((r) => r.headers["cf-access-client-secret"] !== undefined)).toBe(false);
  });

  it("refuses an upload answer that is 200 but not the coordinator's {ok:true}", async () => {
    const c = await syntheticCeremony({ network: "testnet" });
    cleanup.push(() => rm(c.dir, { recursive: true, force: true }));
    const s = await localServer({
      "*": (_q, res) => json(res, 200, { ok: "true", key: "final/shield.final.zkey" }),
    });
    cleanup.push(() => s.close());
    await expect(runPublishFinal({ dir: c.dir, coordinator: s.url })).rejects.toThrow(
      /did not answer ok/,
    );
    expect(s.requests.some((r) => r.path === "/admin/finalize")).toBe(false);
  });
});
