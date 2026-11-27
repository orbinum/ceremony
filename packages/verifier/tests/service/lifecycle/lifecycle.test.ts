/**
 * Startup checks that fail fast, and the draining shutdown: hermetic, under a stand-in ptau pin. A
 * pinned genesis that is not a zkey makes the canary task fail as a broken host would.
 */
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeJson, sha256Hex } from "@orbinum-ceremony/core";
import { describe, expect, it, vi } from "vitest";
import { runIsolated } from "../../../src/isolate";
import {
  createQueue,
  drain,
  loadConfig,
  prepare,
  probeLogDir,
  type ServiceConfig,
} from "../../../src/service";
import { HMAC_KEY, multiplierCeremony, shieldInit, until, within } from "../../support";
import { FAKE_PTAU_TEXT } from "../../support/fake-ptau";

vi.mock("@orbinum-ceremony/core", async (actual) => {
  const { withFakePtau } = await import("../../support/fake-ptau");
  return withFakePtau(await actual());
});

const IDLE = join(import.meta.dirname, "..", "..", "isolate", "workers", "idle.ts");

const configOf = (dir: string, ptau: string, logDir = join(dir, "logs")): ServiceConfig =>
  loadConfig({
    COORDINATOR_URL: "http://127.0.0.1:1",
    VERIFIER_HMAC_KEY: HMAC_KEY,
    CEREMONY_DIR: dir,
    PTAU: ptau,
    LOG_DIR: logDir,
  });

describe("startup", { timeout: 60_000 }, () => {
  it("stages and pins the inputs, after a snarkjs child ran on a genesis", async () => {
    const { dir, ptau } = await multiplierCeremony(FAKE_PTAU_TEXT);
    const inputs = await prepare(configOf(dir, ptau));
    try {
      expect(inputs.pinned).toBe(true);
      expect((await stat(join(dir, "logs"))).isDirectory()).toBe(true);
    } finally {
      await inputs.stage.cleanup();
    }
  });

  it("fails, leaving no copies, when the snarkjs child cannot do its work", async () => {
    const { dir, ptau } = await multiplierCeremony(FAKE_PTAU_TEXT);
    const garbage = new TextEncoder().encode("pinned, but not a zkey");
    await writeFile(join(dir, "genesis", "shield.genesis.zkey"), garbage);
    await writeFile(
      join(dir, "genesis", "init.json"),
      serializeJson(await shieldInit(sha256Hex(garbage), "00".repeat(64))),
    );
    const error = await prepare(configOf(dir, ptau)).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/^snarkjs does not run in a child process: /);
  });

  it("refuses an unwritable LOG_DIR before reading anything else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbinum-verifier-logdir-"));
    await mkdir(join(dir, "ro"));
    await chmod(join(dir, "ro"), 0o500);
    await expect(probeLogDir(join(dir, "ro"))).rejects.toThrow(/^LOG_DIR: not writable: EACCES/);
    await expect(probeLogDir("/dev/null/logs")).rejects.toThrow(/^LOG_DIR: not writable: /);
    await probeLogDir(join(dir, "new", "logs"));
    expect((await stat(join(dir, "new", "logs"))).isDirectory()).toBe(true);
  });
});

describe("shutdown", { timeout: 30_000 }, () => {
  it("kills the child of a job that outlives the drain bound, and removes the copies", async () => {
    const { dir, ptau } = await multiplierCeremony(FAKE_PTAU_TEXT);
    const inputs = await prepare(configOf(dir, ptau));
    const pidFile = join(dir, "pid");
    let outcome: Promise<unknown> = Promise.resolve();
    const queue = createQueue(async () => {
      outcome = runIsolated(IDLE, { pidFile }, { timeoutMs: 60_000, maxRssBytes: 2 ** 31 }).catch(
        (e: unknown) => e,
      );
      await outcome;
    }, 60_000);
    queue.submit({
      job: { seq: 1, circuit: "shield", attempt: 1, index: 1 },
    } as Parameters<typeof queue.submit>[0]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      await until(10_000, "the job's child started", () => existsSync(pidFile));
      await drain(server, queue, inputs, 100);
      expect(await within(10_000, "the job's child", outcome)).toMatchObject({
        failure: "crashed",
        message: expect.stringContaining("SIGKILL"),
      });
      await expect(stat(inputs.stage.dir)).rejects.toThrow("ENOENT");
      expect(error).toHaveBeenCalledWith(
        "verifier: the job in flight did not finish in time; stopping it",
      );
    } finally {
      error.mockRestore();
    }
  });
});
